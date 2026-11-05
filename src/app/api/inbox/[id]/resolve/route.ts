import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { ConflictError, NotFoundError } from '@/lib/errors';
import {
  INBOX_DECISIONS,
  INBOX_INPUT_ERRORS,
  resolveInboxItem,
  type InboxDecision,
} from '@/domain/inbox/repo';

export const dynamic = 'force-dynamic';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  if (!isPlainObject(body)) return fail('Request body must be a JSON object', 400);

  const { decision, answer, saveToBank } = body;
  if (typeof decision !== 'string' || !INBOX_DECISIONS.includes(decision as InboxDecision)) {
    return fail('decision must be one of answered, approved, skipped', 400);
  }
  if (answer !== undefined && typeof answer !== 'string') return fail('answer must be a string', 400);
  if (saveToBank !== undefined && typeof saveToBank !== 'boolean') {
    return fail('saveToBank must be a boolean', 400);
  }

  try {
    const item = await resolveInboxItem(getDb(), params.id, {
      decision: decision as InboxDecision,
      answer,
      saveToBank,
    });
    return ok({ item });
  } catch (err) {
    if (err instanceof NotFoundError) return fail('Inbox item not found', 404);
    if (err instanceof ConflictError) return fail('Inbox item is already resolved', 409);
    if (err instanceof Error && INBOX_INPUT_ERRORS.has(err.message)) return fail(err.message, 400);
    console.error('[inbox:resolve]', err);
    return fail('Internal error', 500);
  }
}
