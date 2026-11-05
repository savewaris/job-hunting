import { beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/sql';
import { NotFoundError } from '@/lib/errors';
import { createApplication } from '@/domain/applications/repo';
import { normalizeQuestionKey } from '@/domain/answers/key';
import { askOrRecall, deleteAnswer, listAnswers, saveAnswer } from '@/domain/answers/repo';
import { createTestDb } from '../helpers/testDb';

let sql: Sql;
let jobId: string;

beforeEach(async () => {
  sql = await createTestDb();
  jobId = (await createApplication(sql, { companyName: 'Acme', jobTitle: 'Dev' })).id;
});

async function inboxCount(): Promise<number> {
  const res = await sql.query<{ n: string }>('SELECT count(*)::text AS n FROM inbox_items');
  return Number(res.rows[0].n);
}

const THAI = 'เงินเดือนที่คาดหวัง?';

describe('normalizeQuestionKey', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeQuestionKey('  Expected   Salary?? ')).toBe('expected salary');
  });

  it('keeps Thai letters and combining marks', () => {
    const key = normalizeQuestionKey(THAI);
    expect(key).not.toBe('');
    expect(key).toContain('เงิน');
    expect(key).toContain('ิ'); // sara i
    expect(key).toContain('ื'); // sara ue
    expect(key).not.toContain('?');
  });

  it('returns an empty string when nothing usable remains', () => {
    expect(normalizeQuestionKey('???')).toBe('');
  });
});

describe('saveAnswer / listAnswers / deleteAnswer', () => {
  it('throws for a question with no usable text', async () => {
    await expect(saveAnswer(sql, '???', 'x')).rejects.toThrow('Question has no usable text');
  });

  it('upserts by normalised key', async () => {
    await saveAnswer(sql, 'Expected salary?', '50k');
    const second = await saveAnswer(sql, '  expected   SALARY ', '60k');
    expect(second.key).toBe('expected salary');
    expect(second.answer).toBe('60k');
    const all = await listAnswers(sql);
    expect(all).toHaveLength(1);
    expect(all[0].answer).toBe('60k');
    expect(typeof all[0].updatedAt).toBe('string');
    expect(new Date(all[0].updatedAt).toISOString()).toBe(all[0].updatedAt);
  });

  it('deleteAnswer removes the entry and throws NotFoundError for a missing key', async () => {
    const entry = await saveAnswer(sql, 'Notice period', '30 days');
    await deleteAnswer(sql, entry.key);
    expect(await listAnswers(sql)).toEqual([]);
    await expect(deleteAnswer(sql, entry.key)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('askOrRecall', () => {
  it('throws for a question with no usable text and creates nothing', async () => {
    await expect(askOrRecall(sql, { jobApplicationId: jobId, questionText: '???' })).rejects.toThrow(
      'Question has no usable text',
    );
    expect(await inboxCount()).toBe(0);
  });

  it('recalls a saved answer without creating an inbox item', async () => {
    await saveAnswer(sql, 'Expected salary?', '50k');
    const first = await askOrRecall(sql, { jobApplicationId: jobId, questionText: 'Expected salary?' });
    expect(first).toEqual({ kind: 'answered', answer: '50k' });
    const second = await askOrRecall(sql, {
      jobApplicationId: jobId,
      questionText: '  EXPECTED   salary!! ',
    });
    expect(second).toEqual({ kind: 'answered', answer: '50k' });
    expect(await inboxCount()).toBe(0);
  });

  it('recalls a Thai answer for the same question with different punctuation and whitespace', async () => {
    await saveAnswer(sql, THAI, '50,000 บาท');
    const res = await askOrRecall(sql, {
      jobApplicationId: jobId,
      questionText: '  เงินเดือนที่คาดหวัง   ',
    });
    expect(res).toEqual({ kind: 'answered', answer: '50,000 บาท' });
    expect(await inboxCount()).toBe(0);
  });

  it('creates one open question item the first time and returns the same itemId when called again', async () => {
    const a = await askOrRecall(sql, { jobApplicationId: jobId, questionText: 'Why us?' });
    const b = await askOrRecall(sql, { jobApplicationId: jobId, questionText: ' why   US ' });
    expect(a.kind).toBe('pending');
    expect(b).toEqual(a);
    const rows = await sql.query<{
      id: string;
      kind: string;
      prompt: string;
      question_key: string;
      payload: unknown;
      status: string;
      job_application_id: string;
    }>('SELECT id, kind, prompt, question_key, payload, status, job_application_id FROM inbox_items');
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      id: (a as { itemId: string }).itemId,
      kind: 'question',
      prompt: 'Why us?',
      question_key: 'why us',
      payload: {},
      status: 'open',
      job_application_id: jobId,
    });
  });

  it('is safe under concurrent calls for the same job and key', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        askOrRecall(sql, { jobApplicationId: jobId, questionText: 'Why us?' }),
      ),
    );
    const ids = new Set(results.map((r) => (r as { itemId: string }).itemId));
    expect(ids.size).toBe(1);
    expect(await inboxCount()).toBe(1);
  });

  it('gives a second job asking the same unanswered question its own open item', async () => {
    const otherId = (await createApplication(sql, { companyName: 'Beta', jobTitle: 'Eng' })).id;
    const a = await askOrRecall(sql, { jobApplicationId: jobId, questionText: 'Why us?' });
    const b = await askOrRecall(sql, { jobApplicationId: otherId, questionText: 'Why us?' });
    expect(a.kind).toBe('pending');
    expect(b.kind).toBe('pending');
    expect((a as { itemId: string }).itemId).not.toBe((b as { itemId: string }).itemId);
    expect(await inboxCount()).toBe(2);
  });

  it('throws NotFoundError for an unknown job uuid and creates no inbox row', async () => {
    await expect(
      askOrRecall(sql, {
        jobApplicationId: '00000000-0000-4000-8000-000000000000',
        questionText: 'Why us?',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await inboxCount()).toBe(0);
  });

  it('throws NotFoundError for a non-uuid job id and creates no inbox row', async () => {
    await expect(
      askOrRecall(sql, { jobApplicationId: 'not-a-uuid', questionText: 'Why us?' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await inboxCount()).toBe(0);
  });
});
