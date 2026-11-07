import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { assertDevOnly, resolveDevDbDir } from '../src/lib/devStore';
import { applyMigrations } from '../src/lib/migrate';
import { wrapPglite } from '../src/lib/pgliteSql';
import type { Sql } from '../src/lib/sql';
import {
  createApplication,
  moveApplication,
  skipApplication,
  type Application,
  type ApplicationStatus,
} from '../src/domain/applications/repo';
import { askOrRecall, saveAnswer } from '../src/domain/answers/repo';
import { createInboxItem } from '../src/domain/inbox/repo';
import { startRun } from '../src/domain/runs/orchestrator';
import { buildMasterProfileCoverLetter } from '../src/domain/tailoring/coverLetter';
import { buildStandardFilledFields } from '../src/domain/ats/formFiller';
import { loadEnv } from './loadEnv';

// Seeds the local dev store (DEV_DB_DIR) with obviously fake data so the
// dashboard and inbox can be checked in a browser. Never touches Postgres.

loadEnv();

const DAY_MS = 86_400_000;

interface SeedJob {
  company: string;
  title: string;
  location: string;
  salary?: string;
  /** Final status. */
  status: ApplicationStatus;
  /** Days ago the job was captured. */
  created: number;
  /** Days ago of each milestone move, oldest first. */
  moves?: Array<[ApplicationStatus, number]>;
}

const JOBS: SeedJob[] = [
  { company: 'Example Co', title: 'Frontend Developer', location: 'Bangkok', salary: '60,000 - 80,000 THB', status: 'maybe', created: 1 },
  { company: 'Sample Labs', title: 'Full-Stack Engineer', location: 'Remote', status: 'wishlist', created: 3 },
  { company: 'Demo Digital', title: 'React Developer', location: 'Bangkok', salary: '55,000 - 75,000 THB', status: 'wishlist', created: 4 },
  { company: 'Placeholder Systems', title: 'TypeScript Developer', location: 'Bangkok', status: 'applied', created: 3, moves: [['applied', 2]] },
  { company: 'Acme Example Ltd', title: 'Web Developer', location: 'Remote', salary: '70,000 - 90,000 THB', status: 'applied', created: 6, moves: [['applied', 5]] },
  { company: 'Fakeware Thailand', title: 'Node.js Backend Developer', location: 'Bangkok', status: 'applied', created: 10, moves: [['applied', 9]] },
  { company: 'Mockup Studio', title: 'UI Engineer', location: 'Bangkok', salary: '65,000 - 85,000 THB', status: 'interviewing', created: 21, moves: [['applied', 20], ['interviewing', 14]] },
  { company: 'Test Corp Asia', title: 'Software Engineer', location: 'Remote', status: 'interviewing', created: 16, moves: [['applied', 15], ['interviewing', 11]] },
  { company: 'Lorem Ipsum Tech', title: 'Senior Frontend Engineer', location: 'Bangkok', salary: '90,000 - 120,000 THB', status: 'offer', created: 26, moves: [['applied', 25], ['interviewing', 18], ['offer', 8]] },
  { company: 'Dummy Data Co', title: 'JavaScript Developer', location: 'Bangkok', status: 'rejected', created: 16, moves: [['applied', 15], ['rejected', 9]] },
  { company: 'Nowhere Inc', title: 'Platform Engineer', location: 'Remote', status: 'rejected', created: 13, moves: [['applied', 12], ['rejected', 4]] },
  { company: 'Overqualified Example', title: 'Junior Web Developer', location: 'Bangkok', salary: '40,000 THB', status: 'skipped', created: 8 },
];

async function seed(sql: Sql) {
  const now = Date.now();

  const existing = await sql.query<{ n: number }>('SELECT count(*)::int AS n FROM job_applications');
  if (existing.rows[0].n > 0) {
    if (!process.argv.includes('--force')) {
      console.error(
        `The dev store already has ${existing.rows[0].n} applications. Pass --force to delete the seeded tables' rows and seed again.`,
      );
      process.exit(1);
    }
    // Dev store only (assertDevOnly ran first). Children before parents.
    await sql.exec(
      'DELETE FROM inbox_items; DELETE FROM skip_reasons; DELETE FROM answer_bank; DELETE FROM runs; DELETE FROM job_applications;',
    );
    console.log('Cleared existing dev rows (--force).');
  }

  const apps: Application[] = [];
  for (const [i, job] of JOBS.entries()) {
    let app = await createApplication(sql, {
      companyName: job.company,
      jobTitle: job.title,
      location: job.location,
      salaryRange: job.salary,
      jobUrl: `https://example.com/jobs/${i + 1}`,
      status: job.status === 'maybe' ? 'maybe' : 'wishlist',
      source: 'seed',
      externalId: `seed-${i + 1}`,
      createdAt: new Date(now - job.created * DAY_MS).toISOString(),
    });
    for (const [status, daysAgo] of job.moves ?? []) {
      app = await moveApplication(sql, app.id, status, new Date(now - daysAgo * DAY_MS));
    }
    if (job.status === 'skipped') {
      app = await skipApplication(sql, app.id, 'bad_pay', 'Seed data: below target salary', new Date(now - 2 * DAY_MS));
    }
    apps.push(app);
  }

  const byCompany = (name: string) => {
    const app = apps.find((a) => a.companyName === name);
    if (!app) throw new Error(`Seed job missing: ${name}`);
    return app;
  };

  // Answer bank (questions below deliberately do not match these keys).
  await saveAnswer(sql, 'Visa / work authorisation?', 'Thai citizen; no visa or sponsorship needed.');
  await saveAnswer(sql, 'Willing to relocate?', 'Open to Bangkok or fully remote; not relocating abroad.');

  // Three open questions on different jobs (one Thai).
  const questions: Array<[string, string]> = [
    ['Placeholder Systems', 'เงินเดือนที่คาดหวัง?'],
    ['Acme Example Ltd', 'Expected salary?'],
    ['Fakeware Thailand', 'Notice period?'],
  ];
  for (const [company, text] of questions) {
    const res = await askOrRecall(sql, { jobApplicationId: byCompany(company).id, questionText: text });
    if (res.kind !== 'pending') throw new Error(`Expected a pending question for "${text}"`);
  }

  const sampleLabs = byCompany('Sample Labs');
  await createInboxItem(sql, {
    jobApplicationId: sampleLabs.id,
    kind: 'approval',
    prompt: 'Approve career-page application & cover letter for Sample Labs (Full-Stack Engineer)?',
    payload: {
      channel: 'career_form',
      applyUrl: sampleLabs.jobUrl ?? 'https://example.com/jobs/2',
      preview: buildMasterProfileCoverLetter({
        companyName: sampleLabs.companyName,
        jobTitle: sampleLabs.jobTitle,
        location: sampleLabs.location,
        requirements: ['Next.js', 'React', 'TypeScript', 'PostgreSQL', 'AI Agents'],
      }),
      filledFields: buildStandardFilledFields(
        sampleLabs.companyName,
        sampleLabs.jobTitle,
        sampleLabs.jobUrl ?? 'https://example.com/jobs/2',
      ),
    },
  });
  await createInboxItem(sql, {
    jobApplicationId: byCompany('Demo Digital').id,
    kind: 'error',
    prompt: 'CAPTCHA on careers page',
    payload: { detail: 'The application form for Demo Digital asked for a CAPTCHA that could not be solved automatically.' },
  });

  const run = await startRun(sql, undefined, new Date(now - 60 * 60 * 1000));

  await sql.exec('CHECKPOINT');
  console.log(
    `Seeded ${apps.length} applications, 3 questions, 1 approval, 1 error, 2 answers, 1 run (${run.status}).`,
  );
}

async function main() {
  assertDevOnly(process.env);
  const dir = resolveDevDbDir(process.env.DEV_DB_DIR as string);
  let db: PGlite | null = null;
  try {
    db = new PGlite(dir);
    await db.waitReady;
    const sql = wrapPglite(db);
    await applyMigrations(sql, path.resolve(process.cwd(), 'supabase/migrations'));
    await seed(sql);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `${msg}\n(If the local dev server is holding ${process.env.DEV_DB_DIR}, stop the dev server first before running seed-dev.)`,
    );
    process.exitCode = 1;
  } finally {
    if (db) await db.close().catch(() => undefined);
  }
}

void main();
