import type { Sql } from '@/lib/sql';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { normalizeQuestionKey } from '@/domain/answers/key';
import { NO_USABLE_TEXT } from '@/domain/answers/repo';

export type InboxKind = 'question' | 'approval' | 'error';
export type InboxStatus = 'open' | 'answered' | 'dismissed';
export type InboxDecision = 'answered' | 'approved' | 'skipped';

export interface InboxItem {
  id: string;
  jobApplicationId: string | null;
  companyName: string | null;
  jobTitle: string | null;
  kind: InboxKind;
  prompt: string;
  payload: Record<string, unknown>;
  status: InboxStatus;
  decision: InboxDecision | null;
  answer: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ResolveInput {
  decision: InboxDecision;
  answer?: string;
  saveToBank?: boolean;
}

export const INBOX_KINDS: readonly InboxKind[] = ['question', 'approval', 'error'];
export const INBOX_DECISIONS: readonly InboxDecision[] = ['answered', 'approved', 'skipped'];

export const MAX_PROMPT_LENGTH = 1000;
export const MAX_ANSWER_LENGTH = 5000;

export const ERR_INVALID_ITEM = 'Invalid inbox item';
export const ERR_SAVE_TO_BANK = 'saveToBank only applies to answered questions';
export const ERR_INVALID_DECISION = 'Invalid decision';
export const ERR_ANSWER_REQUIRED = 'answer is required for an answered decision';
export const ERR_ANSWER_TOO_LONG = 'answer is too long';
export const ERR_ANSWERED_NEEDS_QUESTION = 'answered only applies to question items';
export const ERR_APPROVED_NEEDS_APPROVAL = 'approved only applies to approval items';

export const ERR_NOT_APPROVAL = 'Only approval items can be refined';
export const ERR_PREVIEW_REQUIRED = 'preview is required';

/**
 * Messages of the plain Errors this module throws for bad caller input, so the
 * route layer can map exactly these to 400 and everything else to a generic 500.
 */
export const INBOX_INPUT_ERRORS: ReadonlySet<string> = new Set([
  ERR_INVALID_ITEM,
  ERR_SAVE_TO_BANK,
  ERR_INVALID_DECISION,
  ERR_ANSWER_REQUIRED,
  ERR_ANSWER_TOO_LONG,
  ERR_ANSWERED_NEEDS_QUESTION,
  ERR_APPROVED_NEEDS_APPROVAL,
  ERR_NOT_APPROVAL,
  ERR_PREVIEW_REQUIRED,
  NO_USABLE_TEXT,
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns of an InboxItem, read from `i` (inbox_items) and `a` (job_applications, LEFT JOINed). */
const SELECT_COLS = `
  i.id, i.job_application_id, a.company_name, a.job_title, i.kind, i.prompt, i.payload,
  i.status, i.decision, i.answer, i.created_at, i.resolved_at`;

interface Row {
  id: string;
  job_application_id: string | null;
  company_name: string | null;
  job_title: string | null;
  kind: InboxKind;
  prompt: string;
  payload: Record<string, unknown> | string | null;
  status: InboxStatus;
  decision: InboxDecision | null;
  answer: string | null;
  created_at: Date | string;
  resolved_at: Date | string | null;
}

function iso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toItem(r: Row): InboxItem {
  const payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
  return {
    id: r.id,
    jobApplicationId: r.job_application_id,
    companyName: r.company_name,
    jobTitle: r.job_title,
    kind: r.kind,
    prompt: r.prompt,
    payload: payload ?? {},
    status: r.status,
    decision: r.decision,
    answer: r.answer,
    createdAt: iso(r.created_at) as string,
    resolvedAt: iso(r.resolved_at),
  };
}

export async function createInboxItem(
  sql: Sql,
  input: { jobApplicationId?: string; kind: InboxKind; prompt: string; payload?: object },
): Promise<InboxItem> {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (
    !INBOX_KINDS.includes(input.kind) ||
    !prompt ||
    prompt.length > MAX_PROMPT_LENGTH
  ) {
    throw new Error(ERR_INVALID_ITEM);
  }
  const jobId = input.jobApplicationId ?? null;
  if (jobId !== null && !UUID_RE.test(jobId)) throw new NotFoundError('Application not found');
  const key = input.kind === 'question' ? normalizeQuestionKey(prompt) || null : null;

  let res;
  try {
    res = await sql.query<Row>(
      `WITH ins AS (
         INSERT INTO inbox_items (job_application_id, kind, prompt, question_key, payload)
         VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
         RETURNING *
       )
       SELECT ${SELECT_COLS}
       FROM ins i LEFT JOIN job_applications a ON a.id = i.job_application_id`,
      [jobId, input.kind, prompt, key, JSON.stringify(input.payload ?? {})],
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '23505') throw new ConflictError('This question is already open for this job');
    if (code === '23503') throw new NotFoundError('Application not found');
    throw err;
  }
  return toItem(res.rows[0]);
}

/** Open items, oldest first, all kinds together so approvals/errors are never buried. */
export async function listOpenInbox(sql: Sql): Promise<InboxItem[]> {
  const res = await sql.query<Row>(
    `SELECT ${SELECT_COLS}
     FROM inbox_items i LEFT JOIN job_applications a ON a.id = i.job_application_id
     WHERE i.status = 'open'
     ORDER BY i.created_at ASC, i.id ASC`,
  );
  return res.rows.map(toItem);
}

/** Answered (including approved) items the runner has not picked up yet, oldest resolution first. */
export async function listAnsweredUnresumed(sql: Sql): Promise<InboxItem[]> {
  const res = await sql.query<Row>(
    `SELECT ${SELECT_COLS}
     FROM inbox_items i LEFT JOIN job_applications a ON a.id = i.job_application_id
     WHERE i.status = 'answered' AND i.resumed_at IS NULL
     ORDER BY i.resolved_at ASC, i.id ASC`,
  );
  return res.rows.map(toItem);
}

/** Stamps resumed_at on the given items (only if still unset). */
export async function markResumed(sql: Sql, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) throw new Error('Invalid id');
  }
  await sql.query(
    `UPDATE inbox_items SET resumed_at = now()
     WHERE id = ANY($1::uuid[]) AND resumed_at IS NULL`,
    [ids],
  );
}

interface ItemHead {
  kind: InboxKind;
  prompt: string;
  question_key: string | null;
  status: InboxStatus;
}

/**
 * Resolves an open inbox item. The item update, the optional answer-bank upsert
 * and the resolution of other open questions with the same key are ONE SQL
 * statement (data-modifying CTEs), so they all happen or none do. The update is
 * guarded by status = 'open', so a second resolve can never overwrite the first.
 */
export async function resolveInboxItem(
  sql: Sql,
  id: string,
  input: ResolveInput,
): Promise<InboxItem> {
  const { decision } = input;
  if (!INBOX_DECISIONS.includes(decision)) throw new Error(ERR_INVALID_DECISION);
  const saveToBank = input.saveToBank === true;
  if (saveToBank && decision !== 'answered') throw new Error(ERR_SAVE_TO_BANK);

  let answer: string | null = null;
  if (decision === 'answered') {
    answer = typeof input.answer === 'string' ? input.answer.trim() : '';
    if (!answer) throw new Error(ERR_ANSWER_REQUIRED);
    if (answer.length > MAX_ANSWER_LENGTH) throw new Error(ERR_ANSWER_TOO_LONG);
  } else if (decision === 'approved' && typeof input.answer === 'string') {
    const trimmed = input.answer.trim();
    if (trimmed.length > MAX_ANSWER_LENGTH) throw new Error(ERR_ANSWER_TOO_LONG);
    answer = trimmed || null;
  }

  if (!UUID_RE.test(id)) throw new NotFoundError('Inbox item not found');

  const head = await sql.query<ItemHead>(
    'SELECT kind, prompt, question_key, status FROM inbox_items WHERE id = $1::uuid',
    [id],
  );
  if (head.rows.length === 0) throw new NotFoundError('Inbox item not found');
  const item = head.rows[0];
  if (item.status !== 'open') throw new ConflictError('Inbox item is already resolved');

  if (decision === 'answered' && item.kind !== 'question') {
    throw new Error(ERR_ANSWERED_NEEDS_QUESTION);
  }
  if (decision === 'approved' && item.kind !== 'approval') {
    throw new Error(ERR_APPROVED_NEEDS_APPROVAL);
  }
  if (saveToBank && item.kind !== 'question') throw new Error(ERR_SAVE_TO_BANK);

  let bankKey: string | null = null;
  if (saveToBank) {
    bankKey = item.question_key ?? normalizeQuestionKey(item.prompt);
    if (!bankKey) throw new Error(NO_USABLE_TEXT);
  }

  const status: InboxStatus = decision === 'skipped' ? 'dismissed' : 'answered';
  let res: { rows: Row[] };
  try {
    res = await sql.query<Row>(
      `WITH upd AS (
         UPDATE inbox_items SET
           status = $2::text,
           decision = $3::text,
           answer = $4::text,
           payload = CASE
             WHEN $3::text = 'approved' AND $4::text IS NOT NULL
             THEN jsonb_set(COALESCE(payload, '{}'::jsonb), '{preview}', to_jsonb($4::text), true)
             ELSE payload
           END,
           resolved_at = now()
         WHERE id = $1::uuid AND status = 'open'
         RETURNING *
       ), bank AS (
         INSERT INTO answer_bank (key, question_text, answer, updated_at)
         SELECT $5::text, upd.prompt, $4::text, now() FROM upd WHERE $5::text IS NOT NULL
         ON CONFLICT (key) DO UPDATE SET
           question_text = EXCLUDED.question_text,
           answer = EXCLUDED.answer,
           updated_at = now()
         RETURNING key
       ), siblings AS (
         UPDATE inbox_items s SET
           status = 'answered',
           decision = 'answered',
           answer = $4::text,
           resolved_at = now()
         FROM upd
         WHERE $5::text IS NOT NULL
           AND s.id <> upd.id
           AND s.kind = 'question'
           AND s.status = 'open'
           AND s.question_key = $5::text
         RETURNING s.id
       )
       SELECT ${SELECT_COLS}
       FROM upd i LEFT JOIN job_applications a ON a.id = i.job_application_id`,
      [id, status, decision, answer, bankKey],
    );
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === '40P01' || code === '40001') {
      throw new ConflictError('Inbox item is already resolved');
    }
    throw err;
  }
  if (res.rows.length > 0) return toItem(res.rows[0]);

  // Zero rows updated: someone else resolved (or deleted) it since our read.
  const again = await sql.query<{ status: InboxStatus }>(
    'SELECT status FROM inbox_items WHERE id = $1::uuid',
    [id],
  );
  if (again.rows.length === 0) throw new NotFoundError('Inbox item not found');
  throw new ConflictError('Inbox item is already resolved');
}

export interface ApprovalJobContext {
  item: InboxItem;
  jobDescription: string | null;
  requirements: string[] | null;
  location: string | null;
}

/** Loads an open approval inbox item along with its linked job context. */
export async function getOpenApprovalContext(sql: Sql, id: string): Promise<ApprovalJobContext> {
  if (!UUID_RE.test(id)) throw new NotFoundError('Inbox item not found');
  const res = await sql.query<
    Row & {
      job_description: string | null;
      requirements: string[] | null;
      location: string | null;
    }
  >(
    `SELECT ${SELECT_COLS}, a.job_description, a.requirements, a.location
     FROM inbox_items i LEFT JOIN job_applications a ON a.id = i.job_application_id
     WHERE i.id = $1::uuid`,
    [id],
  );
  if (res.rows.length === 0) throw new NotFoundError('Inbox item not found');
  const row = res.rows[0];
  if (row.status !== 'open') throw new ConflictError('Inbox item is already resolved');
  if (row.kind !== 'approval') throw new Error(ERR_NOT_APPROVAL);
  return {
    item: toItem(row),
    jobDescription: row.job_description ?? null,
    requirements: row.requirements ?? null,
    location: row.location ?? null,
  };
}

/** Saves an updated draft preview (and optional metadata) on an open approval item. */
export async function updateApprovalPreview(
  sql: Sql,
  id: string,
  preview: string,
  extraPayload?: Record<string, unknown>,
): Promise<InboxItem> {
  if (!UUID_RE.test(id)) throw new NotFoundError('Inbox item not found');
  const trimmed = typeof preview === 'string' ? preview.trim() : '';
  if (!trimmed) throw new Error(ERR_PREVIEW_REQUIRED);
  if (trimmed.length > MAX_ANSWER_LENGTH) throw new Error(ERR_ANSWER_TOO_LONG);

  const patch = JSON.stringify({ ...(extraPayload ?? {}), preview: trimmed });
  const res = await sql.query<Row>(
    `WITH upd AS (
       UPDATE inbox_items SET
         payload = COALESCE(payload, '{}'::jsonb) || $2::jsonb
       WHERE id = $1::uuid AND status = 'open' AND kind = 'approval'
       RETURNING *
     )
     SELECT ${SELECT_COLS}
     FROM upd i LEFT JOIN job_applications a ON a.id = i.job_application_id`,
    [id, patch],
  );
  if (res.rows.length > 0) return toItem(res.rows[0]);

  const head = await sql.query<{ status: InboxStatus; kind: InboxKind }>(
    'SELECT status, kind FROM inbox_items WHERE id = $1::uuid',
    [id],
  );
  if (head.rows.length === 0) throw new NotFoundError('Inbox item not found');
  if (head.rows[0].status !== 'open') throw new ConflictError('Inbox item is already resolved');
  throw new Error(ERR_NOT_APPROVAL);
}
