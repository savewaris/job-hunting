import type { Sql } from '@/lib/sql';
import { NotFoundError } from '@/lib/errors';
import { normalizeQuestionKey } from './key';

export { normalizeQuestionKey } from './key';

export interface AnswerEntry {
  key: string;
  questionText: string;
  answer: string;
  updatedAt: string;
}

export type AskResult = { kind: 'answered'; answer: string } | { kind: 'pending'; itemId: string };

export const NO_USABLE_TEXT = 'Question has no usable text';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  key: string;
  question_text: string;
  answer: string;
  updated_at: Date | string;
}

function toEntry(r: Row): AnswerEntry {
  const updated = r.updated_at instanceof Date ? r.updated_at : new Date(r.updated_at);
  return {
    key: r.key,
    questionText: r.question_text,
    answer: r.answer,
    updatedAt: updated.toISOString(),
  };
}

function requireKey(questionText: string): string {
  const key = normalizeQuestionKey(questionText);
  if (!key) throw new Error(NO_USABLE_TEXT);
  return key;
}

/** Inserts or replaces the answer for the question's normalised key. */
export async function saveAnswer(
  sql: Sql,
  questionText: string,
  answer: string,
): Promise<AnswerEntry> {
  const key = requireKey(questionText);
  const res = await sql.query<Row>(
    `INSERT INTO answer_bank (key, question_text, answer, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET
       question_text = EXCLUDED.question_text,
       answer = EXCLUDED.answer,
       updated_at = now()
     RETURNING key, question_text, answer, updated_at`,
    [key, questionText, answer],
  );
  return toEntry(res.rows[0]);
}

export async function listAnswers(sql: Sql): Promise<AnswerEntry[]> {
  const res = await sql.query<Row>(
    `SELECT key, question_text, answer, updated_at FROM answer_bank
     ORDER BY updated_at DESC, key ASC`,
  );
  return res.rows.map(toEntry);
}

export async function deleteAnswer(sql: Sql, key: string): Promise<void> {
  const res = await sql.query<{ key: string }>(
    'DELETE FROM answer_bank WHERE key = $1 RETURNING key',
    [key],
  );
  if (res.rows.length === 0) throw new NotFoundError('Answer not found');
}

/**
 * Looks the question up in the answer bank first; a hit returns the stored
 * answer and creates nothing. Otherwise returns the id of the open question
 * inbox item for this job and key, creating it if needed. Creation is
 * race-safe: the insert is ON CONFLICT DO NOTHING against the partial unique
 * index, and a loser selects the winner's row.
 */
export async function askOrRecall(
  sql: Sql,
  input: { jobApplicationId: string; questionText: string },
): Promise<AskResult> {
  const key = requireKey(input.questionText);
  if (!UUID_RE.test(input.jobApplicationId)) throw new NotFoundError('Application not found');

  const hit = await sql.query<{ answer: string }>('SELECT answer FROM answer_bank WHERE key = $1', [
    key,
  ]);
  if (hit.rows.length > 0) return { kind: 'answered', answer: hit.rows[0].answer };

  // A concurrent resolve could close the conflicting item between our insert
  // and select; retry a few times before giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    let inserted;
    try {
      inserted = await sql.query<{ id: string }>(
        `INSERT INTO inbox_items (job_application_id, kind, prompt, question_key, payload)
         VALUES ($1::uuid, 'question', $2, $3, '{}'::jsonb)
         ON CONFLICT (job_application_id, question_key)
           WHERE status = 'open' AND kind = 'question'
         DO NOTHING
         RETURNING id`,
        [input.jobApplicationId, input.questionText, key],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23503') {
        throw new NotFoundError('Application not found');
      }
      throw err;
    }
    if (inserted.rows.length > 0) return { kind: 'pending', itemId: inserted.rows[0].id };

    const existing = await sql.query<{ id: string }>(
      `SELECT id FROM inbox_items
       WHERE job_application_id = $1::uuid AND question_key = $2
         AND status = 'open' AND kind = 'question'`,
      [input.jobApplicationId, key],
    );
    if (existing.rows.length > 0) return { kind: 'pending', itemId: existing.rows[0].id };
  }
  throw new Error('Could not create or find the open question item');
}
