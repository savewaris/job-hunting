import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/sql';
import type { Sql } from '@/lib/sql';
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route';
import { GET as getRuns, POST as postRun } from '@/app/api/runs/route';
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

const failingDb: Sql = {
  query: async () => {
    throw new Error('secret connection detail');
  },
  exec: async () => undefined,
};

function put(body: unknown, raw = false) {
  return putSettings(
    new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

async function currentSettings() {
  const res = await getSettings(new Request('http://localhost/api/settings'));
  return (await res.json()).settings;
}

describe('GET /api/settings', () => {
  it('returns the defaults', async () => {
    const res = await getSettings(new Request('http://localhost/api/settings'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      settings: { scheduleEnabled: false, maxDailyDrafts: 20 },
    });
  });

  it('returns a generic 500 on database failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDb(failingDb);
    const res = await getSettings(new Request('http://localhost/api/settings'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
  });
});

describe('PUT /api/settings', () => {
  it('route: PUT settings with scheduleEnabled → 400', async () => {
    const res = await put({ scheduleEnabled: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: "Scheduling isn't built yet" });
    expect((await currentSettings()).scheduleEnabled).toBe(false);
  });

  it('scheduleEnabled alongside a valid key still fails and writes nothing', async () => {
    const res = await put({ maxDailyDrafts: 99, scheduleEnabled: false });
    expect(res.status).toBe(400);
    expect((await currentSettings()).maxDailyDrafts).toBe(20);
  });

  it('rejects an unknown key', async () => {
    const res = await put({ bogus: 1 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Unknown setting' });
  });

  it.each([0, 201, 2.5])('rejects maxDailyDrafts %s', async (value) => {
    const res = await put({ maxDailyDrafts: value });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: 'maxDailyDrafts must be an integer between 1 and 200',
    });
  });

  it('persists a valid value', async () => {
    const res = await put({ maxDailyDrafts: 35 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      settings: { scheduleEnabled: false, maxDailyDrafts: 35 },
    });
    expect((await currentSettings()).maxDailyDrafts).toBe(35);
  });

  it('rejects invalid JSON', async () => {
    const res = await put('{nope', true);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Invalid JSON body' });
  });

  it.each([['null'], ['[]'], ['"x"'], ['5']])('rejects non-object body %s', async (raw) => {
    const res = await put(raw, true);
    expect(res.status).toBe(400);
  });

  it('returns a generic 500 on database failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDb(failingDb);
    const res = await put({ maxDailyDrafts: 5 });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
  });
});

describe('POST /api/runs', () => {
  const post = () => postRun(new Request('http://localhost/api/runs', { method: 'POST' }));

  it('starts a run without needing a body, twice sequentially', async () => {
    const a = await post();
    expect(a.status).toBe(200);
    const aj = await a.json();
    expect(aj.success).toBe(true);
    expect(aj.run.status).toBe('succeeded');
    expect(aj.run.summary).toEqual({ steps: { resumeAnsweredInbox: { resumed: 0 } } });
    const b = await post();
    expect(b.status).toBe(200);
    expect((await b.json()).run.status).toBe('succeeded');
  });

  it('returns 409 while a run is in progress', async () => {
    await sql.query(`INSERT INTO runs (status) VALUES ('running')`);
    const res = await post();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: 'A run is already in progress' });
  });

  it('returns a generic 500 on database failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDb(failingDb);
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
  });
});

describe('GET /api/runs', () => {
  it('returns the latest 5 runs, newest first', async () => {
    for (let i = 0; i < 7; i++) {
      await sql.query(
        `INSERT INTO runs (status, started_at, finished_at) VALUES ('succeeded', $1, $1)`,
        [new Date(Date.UTC(2026, 10, 1 + i)).toISOString()],
      );
    }
    const res = await getRuns(new Request('http://localhost/api/runs'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.runs).toHaveLength(5);
    expect(json.runs.map((r: { startedAt: string }) => r.startedAt)).toEqual([
      '2026-11-07T00:00:00.000Z',
      '2026-11-06T00:00:00.000Z',
      '2026-11-05T00:00:00.000Z',
      '2026-11-04T00:00:00.000Z',
      '2026-11-03T00:00:00.000Z',
    ]);
  });

  it('returns a generic 500 on database failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDb(failingDb);
    const res = await getRuns(new Request('http://localhost/api/runs'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
  });
});
