import { beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/sql';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { createApplication } from '@/domain/applications/repo';
import { askOrRecall, listAnswers } from '@/domain/answers/repo';
import {
  createInboxItem,
  listAnsweredUnresumed,
  listOpenInbox,
  markResumed,
  resolveInboxItem,
} from '@/domain/inbox/repo';
import { createTestDb } from '../helpers/testDb';

let sql: Sql;
let jobId: string;

beforeEach(async () => {
  sql = await createTestDb();
  jobId = (await createApplication(sql, { companyName: 'Acme', jobTitle: 'Dev' })).id;
});

async function question(prompt = 'Expected salary?') {
  return createInboxItem(sql, { jobApplicationId: jobId, kind: 'question', prompt });
}

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('createInboxItem', () => {
  it('creates an open item with the normalised question key for questions', async () => {
    const item = await question('  Expected   Salary?? ');
    expect(item).toMatchObject({
      jobApplicationId: jobId,
      companyName: 'Acme',
      jobTitle: 'Dev',
      kind: 'question',
      status: 'open',
      decision: null,
      answer: null,
      resolvedAt: null,
      payload: {},
    });
    const row = await sql.query<{ question_key: string | null }>(
      'SELECT question_key FROM inbox_items WHERE id = $1',
      [item.id],
    );
    expect(row.rows[0].question_key).toBe('expected salary');
  });

  it('stores no question key for approvals and accepts a payload', async () => {
    const item = await createInboxItem(sql, {
      kind: 'approval',
      prompt: 'Send application?',
      payload: { draft: 'hi' },
    });
    expect(item.jobApplicationId).toBeNull();
    expect(item.companyName).toBeNull();
    expect(item.payload).toEqual({ draft: 'hi' });
    const row = await sql.query<{ question_key: string | null }>(
      'SELECT question_key FROM inbox_items WHERE id = $1',
      [item.id],
    );
    expect(row.rows[0].question_key).toBeNull();
  });

  it('rejects empty, whitespace-only and over-long prompts and unknown kinds', async () => {
    await expect(createInboxItem(sql, { kind: 'error', prompt: '   ' })).rejects.toThrow(
      'Invalid inbox item',
    );
    await expect(
      createInboxItem(sql, { kind: 'error', prompt: 'x'.repeat(1001) }),
    ).rejects.toThrow('Invalid inbox item');
    await expect(createInboxItem(sql, { kind: 'bogus' as never, prompt: 'x' })).rejects.toThrow(
      'Invalid inbox item',
    );
  });

  it('throws ConflictError for a duplicate open question on the same job', async () => {
    await question('Expected salary?');
    await expect(question('expected   salary')).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFoundError for a non-uuid or unknown job id', async () => {
    await expect(
      createInboxItem(sql, { jobApplicationId: 'nope', kind: 'error', prompt: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createInboxItem(sql, { jobApplicationId: MISSING_ID, kind: 'error', prompt: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listOpenInbox', () => {
  it('includes company and title from the joined application', async () => {
    await question();
    const items = await listOpenInbox(sql);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      companyName: 'Acme',
      jobTitle: 'Dev',
      prompt: 'Expected salary?',
    });
  });

  it('returns only open items, oldest first, all kinds together', async () => {
    const a = await question('First?');
    const b = await createInboxItem(sql, { kind: 'approval', prompt: 'Second' });
    const c = await createInboxItem(sql, { kind: 'error', prompt: 'Third' });
    const d = await question('Fourth?');
    await sql.query(
      `UPDATE inbox_items SET created_at = now() - (interval '1 minute' * (5 - v.n))
       FROM (VALUES ($1::uuid, 1), ($2::uuid, 2), ($3::uuid, 3), ($4::uuid, 4)) AS v(id, n)
       WHERE inbox_items.id = v.id`,
      [a.id, b.id, c.id, d.id],
    );
    await resolveInboxItem(sql, d.id, { decision: 'skipped' });
    const items = await listOpenInbox(sql);
    expect(items.map((i) => i.id)).toEqual([a.id, b.id, c.id]);
    expect(items[1].companyName).toBeNull();
  });
});

describe('resolveInboxItem', () => {
  it('resolve answered stores the answer and status answered', async () => {
    const item = await question();
    const res = await resolveInboxItem(sql, item.id, { decision: 'answered', answer: '  50k ' });
    expect(res).toMatchObject({
      id: item.id,
      status: 'answered',
      decision: 'answered',
      answer: '50k',
    });
    expect(res.resolvedAt).not.toBeNull();
    expect(new Date(res.resolvedAt as string).toISOString()).toBe(res.resolvedAt);
    expect(await listOpenInbox(sql)).toEqual([]);
    expect(await listAnswers(sql)).toEqual([]);
  });

  it('skipped decision sets status dismissed', async () => {
    const item = await question();
    const res = await resolveInboxItem(sql, item.id, { decision: 'skipped' });
    expect(res).toMatchObject({ status: 'dismissed', decision: 'skipped', answer: null });
  });

  it('skipped works for any kind', async () => {
    const e = await createInboxItem(sql, { kind: 'error', prompt: 'boom' });
    expect((await resolveInboxItem(sql, e.id, { decision: 'skipped' })).status).toBe('dismissed');
  });

  it('approved sets status answered with no answer on an approval', async () => {
    const item = await createInboxItem(sql, { kind: 'approval', prompt: 'Send?' });
    const res = await resolveInboxItem(sql, item.id, { decision: 'approved' });
    expect(res).toMatchObject({ status: 'answered', decision: 'approved', answer: null });
  });

  it('rejects approved on a question, answered on an approval, and writes nothing', async () => {
    const q = await question();
    const ap = await createInboxItem(sql, { kind: 'approval', prompt: 'Send?' });
    await expect(resolveInboxItem(sql, q.id, { decision: 'approved' })).rejects.toThrow(Error);
    await expect(
      resolveInboxItem(sql, ap.id, { decision: 'answered', answer: 'yes' }),
    ).rejects.toThrow(Error);
    expect(await listOpenInbox(sql)).toHaveLength(2);
  });

  it('rejects answered without a non-empty answer, or with an over-long one', async () => {
    const item = await question();
    await expect(resolveInboxItem(sql, item.id, { decision: 'answered' })).rejects.toThrow(Error);
    await expect(
      resolveInboxItem(sql, item.id, { decision: 'answered', answer: '   ' }),
    ).rejects.toThrow(Error);
    await expect(
      resolveInboxItem(sql, item.id, { decision: 'answered', answer: 'x'.repeat(5001) }),
    ).rejects.toThrow(Error);
    expect(await listOpenInbox(sql)).toHaveLength(1);
  });

  it('rejects an unknown decision', async () => {
    const item = await question();
    await expect(resolveInboxItem(sql, item.id, { decision: 'maybe' as never })).rejects.toThrow(
      Error,
    );
  });

  it('resolve on unknown id throws NotFoundError', async () => {
    await expect(resolveInboxItem(sql, MISSING_ID, { decision: 'skipped' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('non-uuid id throws NotFoundError and writes nothing', async () => {
    await question();
    await expect(
      resolveInboxItem(sql, 'not-a-uuid', { decision: 'answered', answer: 'x', saveToBank: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await listOpenInbox(sql)).toHaveLength(1);
    expect(await listAnswers(sql)).toEqual([]);
  });

  it('resolving an already answered item throws ConflictError and keeps the first answer', async () => {
    const item = await question();
    await resolveInboxItem(sql, item.id, { decision: 'answered', answer: 'first' });
    await expect(
      resolveInboxItem(sql, item.id, { decision: 'answered', answer: 'second', saveToBank: true }),
    ).rejects.toBeInstanceOf(ConflictError);
    const row = await sql.query<{ answer: string; status: string }>(
      'SELECT answer, status FROM inbox_items WHERE id = $1',
      [item.id],
    );
    expect(row.rows[0]).toEqual({ answer: 'first', status: 'answered' });
    expect(await listAnswers(sql)).toEqual([]);
  });

  it('resolving a dismissed/skipped item twice throws ConflictError', async () => {
    const item = await question();
    await resolveInboxItem(sql, item.id, { decision: 'skipped' });
    await expect(resolveInboxItem(sql, item.id, { decision: 'skipped' })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('saveToBank writes the answer under the normalised question key atomically', async () => {
    const item = await question('Expected salary??');
    const res = await resolveInboxItem(sql, item.id, {
      decision: 'answered',
      answer: '50k',
      saveToBank: true,
    });
    expect(res.status).toBe('answered');
    const bank = await listAnswers(sql);
    expect(bank).toHaveLength(1);
    expect(bank[0]).toMatchObject({
      key: 'expected salary',
      questionText: 'Expected salary??',
      answer: '50k',
    });
  });

  it('saveToBank upserts over an existing bank entry', async () => {
    await sql.query(
      "INSERT INTO answer_bank (key, question_text, answer) VALUES ('expected salary', 'old', 'old')",
    );
    const item = await question('Expected salary?');
    await resolveInboxItem(sql, item.id, { decision: 'answered', answer: '60k', saveToBank: true });
    const bank = await listAnswers(sql);
    expect(bank).toHaveLength(1);
    expect(bank[0]).toMatchObject({ answer: '60k', questionText: 'Expected salary?' });
  });

  it('saveToBank with an unusable question text throws and leaves the item open', async () => {
    // Legacy row whose prompt normalises to nothing and has no stored key.
    const row = await sql.query<{ id: string }>(
      `INSERT INTO inbox_items (job_application_id, kind, prompt) VALUES ($1, 'question', '???')
       RETURNING id`,
      [jobId],
    );
    await expect(
      resolveInboxItem(sql, row.rows[0].id, {
        decision: 'answered',
        answer: 'x',
        saveToBank: true,
      }),
    ).rejects.toThrow('Question has no usable text');
    expect(await listOpenInbox(sql)).toHaveLength(1);
    expect(await listAnswers(sql)).toEqual([]);
  });

  it('saveToBank only applies to answered questions', async () => {
    const q = await question();
    const ap = await createInboxItem(sql, { kind: 'approval', prompt: 'Send?' });
    await expect(
      resolveInboxItem(sql, ap.id, { decision: 'approved', saveToBank: true }),
    ).rejects.toThrow('saveToBank only applies to answered questions');
    await expect(
      resolveInboxItem(sql, q.id, { decision: 'skipped', saveToBank: true }),
    ).rejects.toThrow('saveToBank only applies to answered questions');
    expect(await listOpenInbox(sql)).toHaveLength(2);
    expect(await listAnswers(sql)).toEqual([]);
  });

  describe('sibling resolution', () => {
    let first: string;
    let second: string;

    beforeEach(async () => {
      const otherJobId = (await createApplication(sql, { companyName: 'Globex', jobTitle: 'Eng' }))
        .id;
      const a = await askOrRecall(sql, {
        jobApplicationId: jobId,
        questionText: 'Expected salary?',
      });
      const b = await askOrRecall(sql, {
        jobApplicationId: otherJobId,
        questionText: 'expected salary',
      });
      if (a.kind !== 'pending' || b.kind !== 'pending') throw new Error('expected pending');
      first = a.itemId;
      second = b.itemId;
    });

    it('answering one with saveToBank resolves the other open item with the same question', async () => {
      await resolveInboxItem(sql, first, { decision: 'answered', answer: '50k', saveToBank: true });
      const row = await sql.query<Record<string, unknown>>(
        'SELECT status, decision, answer, resolved_at FROM inbox_items WHERE id = $1',
        [second],
      );
      expect(row.rows[0]).toMatchObject({
        status: 'answered',
        decision: 'answered',
        answer: '50k',
      });
      expect(row.rows[0].resolved_at).not.toBeNull();
      expect(await listOpenInbox(sql)).toEqual([]);
      expect(await listAnsweredUnresumed(sql)).toHaveLength(2);
    });

    it('without saveToBank the sibling stays open', async () => {
      await resolveInboxItem(sql, first, { decision: 'answered', answer: '50k' });
      const open = await listOpenInbox(sql);
      expect(open.map((i) => i.id)).toEqual([second]);
    });

    it('does not touch open items with a different question or of another kind', async () => {
      const other = await question('Notice period?');
      const approval = await createInboxItem(sql, { kind: 'approval', prompt: 'Expected salary' });
      await resolveInboxItem(sql, first, { decision: 'answered', answer: '50k', saveToBank: true });
      const open = (await listOpenInbox(sql)).map((i) => i.id).sort();
      expect(open).toEqual([other.id, approval.id].sort());
    });
  });
});

describe('listAnsweredUnresumed / markResumed', () => {
  it('listAnsweredUnresumed returns answered items until markResumed is called', async () => {
    const q = await question();
    const ap = await createInboxItem(sql, { kind: 'approval', prompt: 'Send?' });
    const sk = await createInboxItem(sql, { kind: 'error', prompt: 'boom' });
    await resolveInboxItem(sql, q.id, { decision: 'answered', answer: '50k' });
    await resolveInboxItem(sql, ap.id, { decision: 'approved' });
    await resolveInboxItem(sql, sk.id, { decision: 'skipped' });

    await sql.query(
      `UPDATE inbox_items SET resolved_at = now() - interval '1 hour' WHERE id = $1`,
      [ap.id],
    );
    const list = await listAnsweredUnresumed(sql);
    expect(list.map((i) => i.id)).toEqual([ap.id, q.id]);

    await markResumed(sql, [q.id]);
    expect((await listAnsweredUnresumed(sql)).map((i) => i.id)).toEqual([ap.id]);
    await markResumed(sql, [ap.id]);
    expect(await listAnsweredUnresumed(sql)).toEqual([]);
  });

  it('markResumed does not overwrite an earlier resumed_at and ignores an empty list', async () => {
    const q = await question();
    await resolveInboxItem(sql, q.id, { decision: 'answered', answer: 'x' });
    await markResumed(sql, []);
    expect(await listAnsweredUnresumed(sql)).toHaveLength(1);
    await markResumed(sql, [q.id]);
    const before = await sql.query<{ resumed_at: Date }>(
      'SELECT resumed_at FROM inbox_items WHERE id = $1',
      [q.id],
    );
    await markResumed(sql, [q.id]);
    const after = await sql.query<{ resumed_at: Date }>(
      'SELECT resumed_at FROM inbox_items WHERE id = $1',
      [q.id],
    );
    expect(new Date(after.rows[0].resumed_at).getTime()).toBe(
      new Date(before.rows[0].resumed_at).getTime(),
    );
  });

  it('markResumed throws on a non-uuid id and changes nothing', async () => {
    const q = await question();
    await resolveInboxItem(sql, q.id, { decision: 'answered', answer: 'x' });
    await expect(markResumed(sql, [q.id, 'nope'])).rejects.toThrow('Invalid id');
    expect(await listAnsweredUnresumed(sql)).toHaveLength(1);
  });
});
