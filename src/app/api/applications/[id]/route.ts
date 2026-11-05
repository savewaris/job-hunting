import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { moveApplication, skipApplication } from '@/domain/applications/repo';
import {
  APPLICATION_STATUSES,
  SKIP_REASONS,
  type ApplicationStatus,
  type SkipReason,
} from '@/domain/applications/types';

export const dynamic = 'force-dynamic';

const MAX_NOTE_LENGTH = 2000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Request body must be valid JSON', 400);
  }
  if (!isPlainObject(body)) return fail('Request body must be a JSON object', 400);

  const hasStatus = 'status' in body;
  const hasSkip = 'skip' in body;
  if (hasStatus && hasSkip) return fail('Provide either status or skip, not both', 400);
  if (!hasStatus && !hasSkip) return fail('Provide status or skip', 400);

  try {
    if (hasStatus) {
      const status = body.status;
      if (typeof status !== 'string' || !(APPLICATION_STATUSES as readonly string[]).includes(status)) {
        return fail('Invalid status', 400);
      }
      const application = await moveApplication(getDb(), params.id, status as ApplicationStatus);
      return ok({ application });
    }

    const skip = body.skip;
    if (!isPlainObject(skip)) return fail('skip must be an object', 400);
    const { reason, note } = skip;
    if (typeof reason !== 'string' || !(SKIP_REASONS as readonly string[]).includes(reason)) {
      return fail('Invalid skip reason', 400);
    }
    if (note !== undefined && (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH)) {
      return fail('Invalid skip note', 400);
    }
    const application = await skipApplication(getDb(), params.id, reason as SkipReason, note);
    return ok({ application });
  } catch (err) {
    if (err instanceof NotFoundError) return fail('Application not found', 404);
    if (err instanceof ConflictError) return fail('Conflict', 409);
    console.error('[applications:PATCH]', err);
    return fail('Failed to update application', 500);
  }
}
