import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/sql';
import type { Sql } from '@/lib/sql';
import { createApplication } from '@/domain/applications/repo';
import { createInboxItem, resolveInboxItem } from '@/domain/inbox/repo';
import { GET } from '@/app/api/inbox/route';
import { POST } from '@/app/api/inbox/[id]/resolve/route';
import { createTestDb } from '../helpers/testDb';

let sql: Sql;
let jobId: string;

beforeEach(async () => {
  sql = await createTestDb();
  setDb(sql);
  jobId = (await createApplication(sql, { companyName: 'Acme', jobTitle: 'Dev' })).id;
});

afterEach(() => {
  setDb(null);
  vi.restoreAllMocks();
});

function post(id: string, body: unknown, raw = false) {
  return POST(
    new Request(`http://localhost/api/inbox/${id}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
    { params: { id } },
  );
}

async function question(prompt = 'Expected salary?') {
  return createInboxItem(sql, { jobApplicationId: jobId, kind: 'question', prompt });
}

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('GET /api/inbox', () => {
  it('returns only open items', async () => {
    const a = await question('One?');
    const b = await question('Two?');
    await resolveInboxItem(sql, a.id, { decision: 'skipped' });
    const res = await GET(new Request('http://localhost/api/inbox'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.items.map((i: { id: string }) => i.id)).toEqual([b.id]);
    expect(json.items[0]).toMatchObject({ companyName: 'Acme', jobTitle: 'Dev' });
  });

  it('returns a generic 500 without leaking the error message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDb({
      query: async () => {
        throw new Error('secret connection detail');
      },
      exec: async () => undefined,
    });
    const res = await GET(new Request('http://localhost/api/inbox'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
  });
});

describe('POST /api/inbox/[id]/resolve', () => {
  it('resolves a question and returns the item', async () => {
    const item = await question();
    const res = await post(item.id, { decision: 'answered', answer: '50k', saveToBank: true });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.item).toMatchObject({ id: item.id, status: 'answered', answer: '50k' });
  });

  it('POST resolve with decision "answered" and empty answer returns 400', async () => {
    const item = await question();
    expect((await post(item.id, { decision: 'answered', answer: '  ' })).status).toBe(400);
    expect((await post(item.id, { decision: 'answered' })).status).toBe(400);
  });

  it('rejects invalid decision, non-string answer, non-boolean saveToBank with 400', async () => {
    const item = await question();
    expect((await post(item.id, { decision: 'maybe' })).status).toBe(400);
    expect((await post(item.id, {})).status).toBe(400);
    expect((await post(item.id, { decision: 'answered', answer: 5 })).status).toBe(400);
    expect((await post(item.id, { decision: 'skipped', saveToBank: 'yes' })).status).toBe(400);
  });

  it('rejects kind/decision mismatches and saveToBank on non-questions with 400', async () => {
    const q = await question();
    const ap = await createInboxItem(sql, { kind: 'approval', prompt: 'Send?' });
    expect((await post(q.id, { decision: 'approved' })).status).toBe(400);
    expect((await post(ap.id, { decision: 'answered', answer: 'yes' })).status).toBe(400);
    const res = await post(ap.id, { decision: 'approved', saveToBank: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('saveToBank only applies to answered questions');
  });

  it('rejects invalid JSON and non-object bodies with 400', async () => {
    const item = await question();
    const res = await post(item.id, '{nope', true);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON body');
    expect((await post(item.id, [1])).status).toBe(400);
    expect((await post(item.id, null)).status).toBe(400);
  });

  it('returns 404 for an unknown or non-uuid id', async () => {
    expect((await post(MISSING_ID, { decision: 'skipped' })).status).toBe(404);
    expect((await post('nope', { decision: 'skipped' })).status).toBe(404);
  });

  it('second POST returns 409 with the first answer unchanged', async () => {
    const item = await question();
    expect((await post(item.id, { decision: 'answered', answer: 'first' })).status).toBe(200);
    const second = await post(item.id, { decision: 'answered', answer: 'second' });
    expect(second.status).toBe(409);
    const row = await sql.query<{ answer: string }>(
      'SELECT answer FROM inbox_items WHERE id = $1',
      [item.id],
    );
    expect(row.rows[0].answer).toBe('first');
  });

  it('returns a generic 500 without leaking the error message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDb({
      query: async () => {
        throw new Error('secret connection detail');
      },
      exec: async () => undefined,
    });
    const res = await post(MISSING_ID, { decision: 'skipped' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
  });
});
