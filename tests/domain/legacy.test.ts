import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/sql';
import type { ScrapedJob } from '@/types/job';
import * as jobsDomain from '@/domain/jobs';
import { createApplication } from '@/domain/applications/repo';
import {
  fromScrapedJob,
  importLegacyJobs,
  listScrapedJobs,
  rowToScrapedJob,
  syncLegacyJobs,
  type ApplicationDbRow,
} from '@/domain/applications/legacy';
import { createTestDb } from '../helpers/testDb';

const legacyJobs = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'src/domain/jobs/jobs.json'), 'utf-8'),
) as ScrapedJob[];

let sql: Sql;

beforeEach(async () => {
  sql = await createTestDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('importLegacyJobs', () => {
  it('imports the jobs in src/domain/jobs/jobs.json', async () => {
    expect(legacyJobs).toHaveLength(2);
    const result = await importLegacyJobs(sql, legacyJobs);
    expect(result).toEqual({ imported: 2, skipped: 0 });
    const rows = await sql.query<{ status: string; source: string; external_id: string }>(
      'SELECT status, source, external_id FROM job_applications ORDER BY external_id',
    );
    expect(rows.rows.map((r) => r.external_id)).toEqual(legacyJobs.map((j) => j.id).sort());
    expect(rows.rows.every((r) => r.status === 'wishlist' && r.source === 'facebook')).toBe(true);
  });

  it('second import reports skipped:2 and creates no duplicates', async () => {
    await importLegacyJobs(sql, legacyJobs);
    const again = await importLegacyJobs(sql, legacyJobs);
    expect(again).toEqual({ imported: 0, skipped: 2 });
    const count = await sql.query<{ n: string }>('SELECT count(*)::text AS n FROM job_applications');
    expect(count.rows[0].n).toBe('2');
  });

  it('keeps contact_method, requirements, raw_post_content and the original capture time', async () => {
    await importLegacyJobs(sql, legacyJobs);
    const first = legacyJobs[0];
    const res = await sql.query<{
      contact_method: unknown;
      requirements: string[];
      raw_post_content: string;
      created_at: Date;
    }>(
      'SELECT contact_method, requirements, raw_post_content, created_at FROM job_applications WHERE external_id = $1',
      [first.id],
    );
    const row = res.rows[0];
    expect(row.contact_method).toEqual(first.contactMethod);
    expect(row.requirements).toEqual(first.requirements);
    expect(row.raw_post_content).toBe(first.rawPostContent);
    expect(new Date(row.created_at).toISOString()).toBe(new Date(first.createdAt).toISOString());
  });
});

describe('ScrapedJob mapping', () => {
  it('round-trips through createApplication and listScrapedJobs', async () => {
    const job = legacyJobs[0];
    const app = await createApplication(sql, fromScrapedJob(job));
    expect(app.externalId).toBe(job.id);
    const [back] = await listScrapedJobs(sql);
    expect(back.id).toBe(job.id);
    expect(back.jobTitle).toBe(job.jobTitle);
    expect(back.companyName).toBe(job.companyName);
    expect(back.contactMethod).toEqual(job.contactMethod);
    expect(back.requirements).toEqual(job.requirements);
    expect(back.jobUrl).toBe(job.jobUrl);
    expect(back.jobDescription).toBe(job.jobDescription);
    expect(back.createdAt).toBe(new Date(job.createdAt).toISOString());
  });

  it('lists newest first', async () => {
    await importLegacyJobs(sql, legacyJobs);
    const jobs = await listScrapedJobs(sql);
    const expected = [...legacyJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    expect(jobs.map((j) => j.id)).toEqual(expected.map((j) => j.id));
  });

  it('rowToScrapedJob handles nulls, a missing external id and an unknown source', () => {
    const row: ApplicationDbRow = {
      id: '11111111-1111-4111-8111-111111111111',
      company_name: 'Acme',
      job_title: 'Dev',
      job_url: null,
      location: null,
      salary_range: null,
      source: 'linkedin',
      external_id: null,
      job_description: null,
      requirements: null,
      contact_method: null,
      raw_post_content: null,
      created_at: new Date('2026-01-02T03:04:05.000Z'),
    };
    expect(rowToScrapedJob(row)).toEqual({
      id: row.id,
      source: 'manual',
      jobTitle: 'Dev',
      companyName: 'Acme',
      jobUrl: '',
      location: '',
      salaryRange: undefined,
      jobDescription: '',
      requirements: [],
      contactMethod: undefined,
      rawPostContent: undefined,
      createdAt: '2026-01-02T03:04:05.000Z',
    });
  });
});

describe('syncLegacyJobs', () => {
  it('copies jobs from the JSON store into the database, idempotently', async () => {
    const getSaved = vi.spyOn(jobsDomain, 'getSavedJobs').mockReturnValue(legacyJobs);
    expect(await syncLegacyJobs(sql)).toEqual({ imported: 2, skipped: 0 });
    expect(await syncLegacyJobs(sql)).toEqual({ imported: 0, skipped: 2 });
    expect((await listScrapedJobs(sql)).map((j) => j.id).sort()).toEqual(
      legacyJobs.map((j) => j.id).sort(),
    );
    getSaved.mockRestore();
  });
});
