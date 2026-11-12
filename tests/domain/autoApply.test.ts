import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/sql';
import { createTestDb } from '../helpers/testDb';
import { generateTailoredResumePdf, rankProjectsForJob, readRoleResume } from '@/domain/tailoring/resumePdf';
import { getMasterProfile } from '@/domain/profile';
import {
  addTargetCompany,
  detectCompanyAts,
  listTargetCompanies,
  removeTargetCompany,
} from '@/domain/companies/repo';
import { classifyRoleStatus, discoverFromCompanyCareers, fetchDirectCareerPageJobs } from '@/domain/companies/discover';
import {
  buildStandardFilledFields,
  inspectCareerFormHtml,
} from '@/domain/ats/formFiller';
import { prepareApplicationDraftsStep } from '@/domain/runs/steps';
import { createApplication } from '@/domain/applications/repo';
import { listOpenInbox } from '@/domain/inbox/repo';
import { getSettings } from '@/domain/settings/repo';

let sql: Sql;
beforeEach(async () => {
  sql = await createTestDb();
});

describe('Slice A: Tailored Resume PDF Generator', () => {
  it('generates a valid non-empty PDF buffer from master-profile.json', async () => {
    const buf = await generateTailoredResumePdf({
      companyName: 'Agoda',
      jobTitle: 'Full Stack Software Engineer',
      jobDescription: 'Build Next.js, TypeScript, and PostgreSQL web platforms.',
      requirements: ['TypeScript', 'Next.js', 'PostgreSQL'],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(1500);
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });

  it('ranks relevant projects highest for matching job requirements', () => {
    const profile = getMasterProfile();
    const ranked = rankProjectsForJob(profile, {
      jobTitle: 'AI Multi-Agent & MCP Orchestration Engineer',
      jobDescription:
        'Seeking experience with Model Context Protocol (MCP), Autonomous Issue Solver, and Gemini Vision AI.',
      requirements: ['MCP', 'Multi-Agent', 'Gemini Vision'],
    });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].title).toContain('Agent Second Brain');
  });
});

describe('Slice B: Direct Company Career Portals & Role Classification', () => {
  it('auto-detects Greenhouse, Lever, Ashby, and direct career URLs', () => {
    expect(detectCompanyAts('https://boards.greenhouse.io/gitlab')).toEqual({
      atsType: 'greenhouse',
      atsSlug: 'gitlab',
    });
    expect(detectCompanyAts('https://jobs.lever.co/omise')).toEqual({
      atsType: 'lever',
      atsSlug: 'omise',
    });
    expect(detectCompanyAts('https://jobs.ashbyhq.com/supabase')).toEqual({
      atsType: 'ashby',
      atsSlug: 'supabase',
    });
    expect(detectCompanyAts('https://careers.agoda.com/engineering')).toEqual({
      atsType: 'direct_careers',
      atsSlug: null,
    });
  });

  it('adds, lists, and removes target company career portals', async () => {
    const initial = await listTargetCompanies(sql);
    expect(initial.length).toBeGreaterThanOrEqual(8); // seeded in 0003_target_companies.sql

    const added = await addTargetCompany(sql, {
      name: 'Linear',
      careersUrl: 'https://jobs.ashbyhq.com/linear',
      locationHint: 'Remote',
    });
    expect(added.atsType).toBe('ashby');
    expect(added.atsSlug).toBe('linear');

    const afterAdd = await listTargetCompanies(sql);
    expect(afterAdd.some((c) => c.name === 'Linear')).toBe(true);

    await removeTargetCompany(sql, added.id);
    const afterRemove = await listTargetCompanies(sql);
    expect(afterRemove.some((c) => c.id === added.id)).toBe(false);
  });

  it('classifies matching software roles into wishlist, maybe, or ignore', () => {
    expect(classifyRoleStatus('Full Stack Software Engineer', 'Bangkok, Thailand')).toBe(
      'wishlist',
    );
    expect(classifyRoleStatus('Senior Principal Software Architect', 'Remote')).toBe('maybe');
    expect(classifyRoleStatus('Enterprise Account Executive', 'Bangkok, Thailand')).toBe(
      'ignore',
    );
  });
});

describe('Slice C: ATS Career Form Inspector & Draft Preparation', () => {
  it('extracts custom screening questions while skipping standard and EEO fields', () => {
    const html = `
      <html>
        <body>
          <form>
            <label>First Name *</label>
            <label>Email *</label>
            <label>Gender Identity</label>
            <label>Why do you want to join our engineering team in Bangkok? *</label>
            <label>What is your expected monthly salary in THB?</label>
          </form>
        </body>
      </html>
    `;
    const res = inspectCareerFormHtml(html);
    expect(res.hasCaptcha).toBe(false);
    expect(res.customQuestions.map((q) => q.label)).toEqual([
      'Why do you want to join our engineering team in Bangkok?',
      'What is your expected monthly salary in THB?',
    ]);
  });

  it('flags CAPTCHA widgets immediately so automation halts', () => {
    const html = `
      <html>
        <body>
          <div class="cf-turnstile" data-sitekey="123"></div>
        </body>
      </html>
    `;
    const res = inspectCareerFormHtml(html);
    expect(res.hasCaptcha).toBe(true);
    expect(res.customQuestions).toEqual([]);
  });

  it('includes Personal Website and GitHub in standard filled fields', () => {
    const fields = buildStandardFilledFields(
      'Supabase',
      'Full Stack Engineer',
      'https://jobs.ashbyhq.com/supabase/123/application',
    );
    expect(fields['Personal Website / Portfolio']).toBe(
      'https://personal-website-full-stack.vercel.app',
    );
    expect(fields['GitHub Profile']).toBe('https://github.com/savewaris');
  });

  it('prepareApplicationDraftsStep creates approval items with cover letter & filled fields for wishlist jobs', async () => {
    await createApplication(sql, {
      companyName: 'DirectTech Co',
      jobTitle: 'Full Stack TypeScript Engineer',
      jobUrl: 'https://example.com/careers/fullstack',
      location: 'Bangkok, Thailand',
      status: 'wishlist',
      jobDescription: 'Build Next.js and PostgreSQL applications.',
      requirements: ['TypeScript', 'Next.js', 'PostgreSQL'],
      contactMethod: { type: 'form', value: 'https://example.com/careers/fullstack' },
    });

    const settings = await getSettings(sql);
    const out = await prepareApplicationDraftsStep.run({
      sql,
      resumed: [],
      settings,
      now: new Date(),
    });
    expect(out.drafted).toBe(1);

    const open = await listOpenInbox(sql);
    const approval = open.find((i) => i.companyName === 'DirectTech Co');
    expect(approval).toBeDefined();
    expect(approval?.kind).toBe('approval');
    expect(String(approval?.payload?.preview ?? '')).toContain(
      'https://personal-website-full-stack.vercel.app',
    );
    expect(String(approval?.payload?.preview ?? '')).toContain('https://github.com/savewaris');
    expect(approval?.payload?.filledFields).toBeDefined();
  });

  it('daily limit counts approvals already queued today', async () => {
    for (const n of ['A', 'B']) {
      await createApplication(sql, {
        companyName: n,
        jobTitle: 'Full Stack Engineer',
        jobUrl: `https://example.com/careers/${n}`,
        status: 'wishlist',
        contactMethod: { type: 'form', value: `https://example.com/careers/${n}` },
      });
    }
    const settings = { ...(await getSettings(sql)), maxDailyDrafts: 1 };
    const run = () => prepareApplicationDraftsStep.run({ sql, resumed: [], settings, now: new Date() });
    expect((await run()).drafted).toBe(1);
    expect((await run()).drafted).toBe(0); // one-per-day limit is used up
  });

  it('a malformed job does not stop the rest of the batch', async () => {
    await createApplication(sql, {
      companyName: 'Good',
      jobTitle: 'Full Stack Engineer',
      status: 'wishlist',
      contactMethod: { type: 'form', value: 'https://example.com/careers/good' },
    });
    const bad = await createApplication(sql, { companyName: 'Bad', jobTitle: 'Full Stack Engineer', status: 'wishlist' });
    await sql.query(`UPDATE job_applications SET contact_method = to_jsonb('{not json'::text) WHERE id = $1::uuid`, [bad.id]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = await prepareApplicationDraftsStep.run({ sql, resumed: [], settings: await getSettings(sql), now: new Date() });
    expect(out).toMatchObject({ drafted: 1, failed: 1 });
  });
});

describe('form inspector noise', () => {
  it('does not treat upload buttons or education/country fields as screening questions', () => {
    const html = ['Attach', 'Enter manually', 'Country', 'School', 'Degree', 'End date month', 'End date year']
      .map((l) => `<label>${l}</label>`)
      .join('') + '<label>Why do you want to work at Acme?</label>';
    expect(inspectCareerFormHtml(html).customQuestions.map((q) => q.label)).toEqual([
      'Why do you want to work at Acme?',
    ]);
  });
});

describe('direct career page scan', () => {
  it('ignores navigation links like "Developers"; keeps links under /careers or /jobs', async () => {
    const html = `<a href="/developers">Developers</a><a href="/docs/react">React docs</a>
      <a href="/careers/42">Full Stack Developer</a>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html)));
    const roles = await fetchDirectCareerPageJobs({
      careersUrl: 'https://acme.test/careers',
      name: 'Acme',
      locationHint: 'Bangkok',
    } as never);
    vi.unstubAllGlobals();
    expect(roles.map((r) => r.jobTitle)).toEqual(['Full Stack Developer']);
  });
});

describe('own role resumes (RESUME_DIR)', () => {
  it('picks the CV file for the job title, defaults to waris-cv.pdf, and is off when unset', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-'));
    for (const f of ['waris-cv', 'waris-cv-fullstack', 'waris-cv-frontend', 'waris-cv-dataengineer', 'waris-cv-mobile']) {
      fs.writeFileSync(path.join(dir, `${f}.pdf`), f);
    }
    vi.stubEnv('RESUME_DIR', dir);
    const pick = (t: string) => readRoleResume(t)?.toString();
    expect(pick('Full Stack Developer')).toBe('waris-cv-fullstack');
    expect(pick('Senior Front-End Engineer')).toBe('waris-cv-frontend');
    expect(pick('Data Engineer')).toBe('waris-cv-dataengineer');
    expect(pick('React Native Developer')).toBe('waris-cv-mobile');
    expect(pick('Software Engineer')).toBe('waris-cv');
    expect((await generateTailoredResumePdf({ jobTitle: 'Full Stack Developer' })).toString()).toBe('waris-cv-fullstack');
    vi.stubEnv('RESUME_DIR', '');
    expect(readRoleResume('Full Stack Developer')).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe('discovery quota', () => {
  it('shares the quota across companies instead of letting the first one use it all', async () => {
    const sql = await createTestDb();
    await sql.query('DELETE FROM target_companies'); // drop the seeded defaults
    for (const slug of ['a', 'b', 'c']) {
      await addTargetCompany(sql, {
        name: `Co ${slug}`,
        careersUrl: `https://boards.greenhouse.io/${slug}`,
        atsType: 'greenhouse',
        atsSlug: slug,
      });
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const slug = /boards\/(\w+)\/jobs/.exec(url)![1];
        const jobs = [1, 2, 3, 4, 5].map((n) => ({
          id: n,
          title: `Full Stack Developer ${n}`,
          absolute_url: `https://example.com/${slug}/${n}`,
          location: { name: 'Bangkok' },
          content: '',
        }));
        return new Response(JSON.stringify({ jobs }));
      }),
    );
    const out = await discoverFromCompanyCareers(sql, 3);
    vi.unstubAllGlobals();
    expect(out.discovered).toBe(3);
    const rows = await sql.query<{ company_name: string }>('SELECT company_name FROM job_applications ORDER BY company_name');
    expect(rows.rows.map((r) => r.company_name)).toEqual(['Co a', 'Co b', 'Co c']);
  });
});
