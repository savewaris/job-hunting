import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/sql';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { createTestDb } from '../helpers/testDb';
import { createApplication } from '@/domain/applications/repo';
import { addTargetCompany } from '@/domain/companies/repo';
import { discoverJobs, runPipeline, skipJob } from '@/mcp/tools';
import { sendApplicationEmail } from '@/lib/mailer';

vi.mock('@/lib/mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  sendApplicationEmail: vi.fn(),
}));
vi.mock('@/lib/liveness', () => ({ isPostingLive: vi.fn(async () => true) }));

let sql: Sql;
beforeEach(async () => {
  sql = await createTestDb();
  await sql.query('DELETE FROM target_companies');
});

describe('queue-only write tools', () => {
  it('discoverJobs clamps maxNewRoles to 50 and saves wishlist roles', async () => {
    const jobs = Array.from({ length: 60 }, (_v, i) => ({
      id: i + 1,
      title: `Backend Engineer ${i + 1}`,
      absolute_url: `https://boards.greenhouse.io/many/jobs/${i + 1}`,
      location: { name: 'Bangkok, Thailand' },
      content: '',
    }));
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ jobs })));
    await addTargetCompany(sql, { name: 'Many Co', careersUrl: 'https://boards.greenhouse.io/many' });
    const out = await discoverJobs(sql, { maxNewRoles: 500 });
    spy.mockRestore();
    expect(out.discovered).toBe(50);
    const rows = await sql.query<{ status: string }>('SELECT DISTINCT status FROM job_applications');
    expect(rows.rows.map((r) => r.status)).toEqual(['wishlist']);
  });

  it('skipJob marks the job skipped and records a reason', async () => {
    const a = await createApplication(sql, { companyName: 'S', jobTitle: 'Developer', status: 'wishlist' });
    const out = await skipJob(sql, { id: a.id, reason: 'wrong_location', note: 'Chiang Mai' });
    expect(out.status).toBe('skipped');
    const r = await sql.query('SELECT 1 FROM skip_reasons WHERE job_application_id = $1::uuid', [a.id]);
    expect(r.rows).toHaveLength(1);
  });

  it('skipJob rejects an unknown id and a bad reason', async () => {
    await expect(skipJob(sql, { id: '00000000-0000-4000-8000-000000000000', reason: 'other' })).rejects.toBeInstanceOf(NotFoundError);
    const a = await createApplication(sql, { companyName: 'S2', jobTitle: 'Developer', status: 'wishlist' });
    await expect(skipJob(sql, { id: a.id, reason: 'bogus' as never })).rejects.toThrow();
  });

  it('skipJob refuses a job you already applied to or are interviewing for', async () => {
    for (const status of ['applied', 'interviewing', 'offer'] as const) {
      const a = await createApplication(sql, { companyName: 'P' + status, jobTitle: 'Developer', status });
      await expect(skipJob(sql, { id: a.id, reason: 'other' })).rejects.toThrow(/wishlist or maybe/);
      const row = await sql.query<{ status: string }>('SELECT status FROM job_applications WHERE id = $1::uuid', [a.id]);
      expect(row.rows[0].status).toBe(status);
    }
  });

  it('runPipeline picks steps by mode, defaulting to resume only', async () => {
    const stepNames = async (mode?: 'resume_only' | 'drafts' | 'full') => {
      const run = await runPipeline(sql, { mode });
      return Object.keys((run.summary as { steps: Record<string, unknown> }).steps);
    };
    expect(await stepNames()).toEqual(['resumeAnsweredInbox']);
    expect(await stepNames('drafts')).toEqual(['resumeAnsweredInbox', 'prepareApplicationDrafts']);
    expect(await stepNames('full')).toEqual(['resumeAnsweredInbox', 'discoverCompanyCareers', 'prepareApplicationDrafts']);
  });

  it('runPipeline reports a run already in progress as ConflictError', async () => {
    await sql.query(`INSERT INTO runs (status, started_at) VALUES ('running', now())`);
    await expect(runPipeline(sql)).rejects.toBeInstanceOf(ConflictError);
  });

  it('runPipeline succeeds, answers nothing and sends no email', async () => {
    const run = await runPipeline(sql);
    expect(run.status).toBe('succeeded');
    const answered = await sql.query(`SELECT 1 FROM inbox_items WHERE status = 'answered'`);
    expect(answered.rows).toHaveLength(0);
    expect(sendApplicationEmail).not.toHaveBeenCalled();
  });
});
