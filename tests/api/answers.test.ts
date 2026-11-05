import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/sql';
import type { Sql } from '@/lib/sql';
import { saveAnswer } from '@/domain/answers/repo';
import { GET, PUT } from '@/app/api/answers/route';
import { DELETE } from '@/app/api/answers/[key]/route';
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

function put(body: unknown, raw = false) {
  return PUT(
    new Request('http://localhost/api/answers', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

function del(key: string) {
  return DELETE(new Request(`http://localhost/api/answers/${key}`, { method: 'DELETE' }), {
    params: { key },
  });
}

describe('PUT /api/answers', () => {
  it('saves an answer and returns the entry', async () => {
    const res = await put({ questionText: 'Expected salary?', answer: '50k' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.answer).toMatchObject({
      key: 'expected salary',
      questionText: 'Expected salary?',
      answer: '50k',
    });
  });

  it('rejects an empty answer with 400', async () => {
    const res = await put({ questionText: 'Expected salary?', answer: '   ' });
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
  });

  it('rejects an empty question with 400', async () => {
    expect((await put({ questionText: '', answer: 'x' })).status).toBe(400);
  });

  it('rejects a question with no usable text with 400', async () => {
    expect((await put({ questionText: '???', answer: 'x' })).status).toBe(400);
  });

  it('rejects non-string fields with 400', async () => {
    expect((await put({ questionText: 5, answer: 'x' })).status).toBe(400);
    expect((await put({ questionText: 'q', answer: null })).status).toBe(400);
  });

  it('rejects over-long fields with 400', async () => {
    expect((await put({ questionText: 'q'.repeat(1001), answer: 'x' })).status).toBe(400);
    expect((await put({ questionText: 'q', answer: 'x'.repeat(5001) })).status).toBe(400);
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await put('{nope', true);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON body');
  });

  it('rejects a non-object body with 400', async () => {
    expect((await put([1, 2])).status).toBe(400);
    expect((await put('str')).status).toBe(400);
    expect((await put(null)).status).toBe(400);
  });

  it('returns a generic 500 without leaking the error message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setDb({
      query: async () => {
        throw new Error('secret connection detail');
      },
      exec: async () => undefined,
    });
    const res = await put({ questionText: 'q', answer: 'a' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal error' });
  });
});

describe('GET /api/answers', () => {
  it('lists saved answers, most recently updated first', async () => {
    await put({ questionText: 'Expected salary?', answer: '50k' });
    await put({ questionText: 'Notice period', answer: '30 days' });
    const res = await GET(new Request('http://localhost/api/answers'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.answers.map((a: { key: string }) => a.key)).toEqual(['notice period', 'expected salary']);
  });
});

describe('DELETE /api/answers/[key]', () => {
  it('removes the entry; a second delete returns 404', async () => {
    await saveAnswer(sql, 'Expected salary?', '50k');
    const first = await del('expected%20salary');
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ success: true });
    const list = await (await GET(new Request('http://localhost/api/answers'))).json();
    expect(list.answers).toEqual([]);
    const second = await del('expected%20salary');
    expect(second.status).toBe(404);
  });

  it('decodes a URL-encoded Thai key', async () => {
    const entry = await saveAnswer(sql, 'เงินเดือนที่คาดหวัง?', '50k');
    const res = await del(encodeURIComponent(entry.key));
    expect(res.status).toBe(200);
  });

  it('returns 400 for malformed percent-encoding', async () => {
    expect((await del('%E0%A4%A')).status).toBe(400);
  });
});
