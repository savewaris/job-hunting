import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ScrapedJob } from '@/types/job';

// Never spawn Playwright: the script "finishes" immediately.
vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, out: string, err: string) => void) =>
    cb(null, 'done', ''),
  ),
}));

import { execFile } from 'child_process';
import { setDb } from '@/lib/sql';
import type { Sql } from '@/lib/sql';
import * as jobsDomain from '@/domain/jobs';
import { POST as scrapePost } from '@/app/api/jobs/scrape-facebook/route';
import { POST as scrollPost } from '@/app/api/facebook/scroll-feed/route';
import { createTestDb } from '../helpers/testDb';

const legacyJobs = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'src/domain/jobs/jobs.json'), 'utf-8'),
) as ScrapedJob[];

let sql: Sql;

beforeEach(async () => {
  sql = await createTestDb();
  setDb(sql);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  setDb(null);
  vi.restoreAllMocks();
});

const req = () =>
  new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });

async function dbIds() {
  const res = await sql.query<{ external_id: string }>('SELECT external_id FROM job_applications');
  return res.rows.map((r) => r.external_id).sort();
}

describe('POST /api/jobs/scrape-facebook', () => {
  it('syncs scraper output into the database and returns the DB list', async () => {
    vi.spyOn(jobsDomain, 'getSavedJobs').mockReturnValue(legacyJobs);
    const res = await scrapePost(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toBeTypeOf('string');
    expect(json.allJobs.map((j: ScrapedJob) => j.id).sort()).toEqual(legacyJobs.map((j) => j.id).sort());
    expect(json.job.id).toBe(json.allJobs[0].id);
    expect(await dbIds()).toEqual(legacyJobs.map((j) => j.id).sort());
  });

  it('500 with a generic message when the script fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(execFile).mockImplementationOnce(((_c: string, _a: string[], _o: unknown, cb: (e: Error) => void) =>
      cb(new Error('/secret/path exploded'))) as never);
    const res = await scrapePost(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
    expect(log).toHaveBeenCalled();
  });
});

describe('POST /api/facebook/scroll-feed', () => {
  it('syncs scraper output into the database and returns the DB list', async () => {
    vi.spyOn(jobsDomain, 'getSavedJobs').mockReturnValue(legacyJobs);
    const res = await scrollPost(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.jobs.map((j: ScrapedJob) => j.id).sort()).toEqual(legacyJobs.map((j) => j.id).sort());
    expect(await dbIds()).toEqual(legacyJobs.map((j) => j.id).sort());
  });

  it('500 with a generic message when the database sync fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(jobsDomain, 'getSavedJobs').mockReturnValue(legacyJobs);
    setDb({
      query: async () => {
        throw new Error('secret');
      },
      exec: async () => undefined,
    });
    const res = await scrollPost(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
    expect(log).toHaveBeenCalled();
  });
});

describe('scrape lock', () => {
  it('409 when another Facebook scrape already holds the browser profile; releases afterwards', async () => {
    const { tryLockScrape } = await import('@/lib/scrapeLock');
    const release = tryLockScrape();
    expect(release).not.toBeNull();
    const res = await scrapePost(req());
    expect(res.status).toBe(409);
    release?.();
    vi.spyOn(jobsDomain, 'getSavedJobs').mockReturnValue(legacyJobs);
    expect((await scrapePost(req())).status).toBe(200);
    expect((await scrollPost(req())).status).toBe(200);
  });
});
