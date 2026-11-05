import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/sql';
import type { Sql } from '@/lib/sql';
import { GET, POST } from '@/app/api/jobs/route';
import * as jobsDomain from '@/domain/jobs';
import { createTestDb } from '../helpers/testDb';

let sql: Sql;

beforeEach(async () => {
  sql = await createTestDb();
  setDb(sql);
});

afterEach(() => {
  setDb(null);
  vi.restoreAllMocks();
});

const failingSql: Sql = {
  query: async () => {
    throw new Error('secret connection details');
  },
  exec: async () => undefined,
};

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/jobs', () => {
  it('400 when rawText and postUrl are both missing', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
  });

  it('saves a parsed post to the database and GET lists it', async () => {
    const res = await post({
      rawText: 'Full Stack Developer\nCompany: Acme Co\nEmail: hr@acme.test\nReact Node.js',
      postUrl: 'https://facebook.com/groups/x/posts/1',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.job.companyName).toBe('Acme Co');
    expect(json.job.contactMethod).toEqual({ type: 'email', value: 'hr@acme.test' });

    const rows = await sql.query<{ source: string; external_id: string; status: string }>(
      'SELECT source, external_id, status FROM job_applications',
    );
    expect(rows.rows).toEqual([{ source: 'facebook', external_id: json.job.id, status: 'wishlist' }]);

    const list = await (await GET()).json();
    expect(list.success).toBe(true);
    expect(list.jobs.map((j: { id: string }) => j.id)).toEqual([json.job.id]);
  });

  it('409 "Job already saved" when the same external id exists, without leaking SQL', async () => {
    vi.spyOn(jobsDomain, 'parseJobText').mockReturnValue({
      id: 'fb-dup',
      jobTitle: 'Dev',
      companyName: 'Acme',
    });
    expect((await post({ rawText: 'a' })).status).toBe(200);
    const res = await post({ rawText: 'a' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: 'Job already saved' });
  });

  it('500 with a generic message and logs the real error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDb(failingSql);
    const res = await post({ rawText: 'Dev' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
    expect(log).toHaveBeenCalled();
  });
});

describe('GET /api/jobs', () => {
  it('500 with a generic message when the database fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDb(failingSql);
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
    expect(log).toHaveBeenCalled();
  });
});
