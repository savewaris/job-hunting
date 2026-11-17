import { beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/sql';
import { NotFoundError } from '@/lib/errors';
import { createTestDb } from '../helpers/testDb';
import { createApplication, skipApplication } from '@/domain/applications/repo';
import { createInboxItem } from '@/domain/inbox/repo';
import { funnelMetrics, getJob, getStatus, listInbox, listJobs } from '@/mcp/tools';

let sql: Sql;
beforeEach(async () => {
  sql = await createTestDb();
});

describe('read tools', () => {
  it('getStatus counts apps by status and reports open inbox items', async () => {
    await createApplication(sql, { companyName: 'A', jobTitle: 'Full Stack Developer', status: 'wishlist' });
    const b = await createApplication(sql, { companyName: 'B', jobTitle: 'Backend Developer', status: 'wishlist' });
    await skipApplication(sql, b.id, 'other');
    const s = await getStatus(sql);
    expect(s.byStatus.wishlist).toBe(1);
    expect(s.byStatus.skipped).toBe(1);
    expect(s.openInbox).toBe(0);
    expect(s.settings.maxDailyDrafts).toBeGreaterThan(0);
  });

  it('listJobs filters Bangkok, clamps the limit and rejects a bad status', async () => {
    await createApplication(sql, { companyName: 'Bkk', jobTitle: 'Developer', location: 'Bangkok, Thailand', status: 'wishlist' });
    await createApplication(sql, { companyName: 'Rem', jobTitle: 'Developer', location: 'Remote', status: 'wishlist' });
    const bkk = await listJobs(sql, { bangkokOnly: true });
    expect(bkk.map((j) => j.companyName)).toEqual(['Bkk']);
    expect((await listJobs(sql, { limit: 1000 })).length).toBeLessThanOrEqual(100);
    await expect(listJobs(sql, { status: 'bogus' as never })).rejects.toThrow();
  });

  it('getJob truncates the description to 4000 chars and includes a fit score', async () => {
    const a = await createApplication(sql, {
      companyName: 'Big',
      jobTitle: 'Full Stack Developer',
      jobDescription: 'x'.repeat(6000),
      requirements: ['TypeScript'],
      status: 'wishlist',
    });
    const job = await getJob(sql, { id: a.id });
    expect(job.untrusted.description.length).toBe(4000);
    expect(job.untrusted.requirements).toEqual(['TypeScript']);
expect(job).not.toHaveProperty('description');
    expect(job.fit.score).toBeGreaterThanOrEqual(1);
    expect(job.fit.score).toBeLessThanOrEqual(5);
  });

  it('getJob rejects an invalid or unknown id with NotFoundError', async () => {
    await expect(getJob(sql, { id: 'not-a-uuid' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJob(sql, { id: '00000000-0000-4000-8000-000000000000' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('listInbox returns open items and funnelMetrics counts apps', async () => {
    const a = await createApplication(sql, { companyName: 'C', jobTitle: 'Developer', status: 'wishlist' });
    await createInboxItem(sql, { jobApplicationId: a.id, kind: 'approval', prompt: 'Approve email?' });
    const inbox = await listInbox(sql);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ kind: 'approval', companyName: 'C', untrusted: { prompt: 'Approve email?' } });
expect(inbox[0]).not.toHaveProperty('prompt');
    expect((await funnelMetrics(sql)).total).toBe(1);
  });
});
