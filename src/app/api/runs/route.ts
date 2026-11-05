import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { ConflictError } from '@/lib/errors';
import { listRecentRuns } from '@/domain/runs/repo';
import { startRun } from '@/domain/runs/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request): Promise<Response> {
  try {
    const runs = await listRecentRuns(getDb(), 5);
    return ok({ runs });
  } catch (err) {
    console.error('[runs:GET]', err);
    return fail('Internal error', 500);
  }
}

export async function POST(_req: Request): Promise<Response> {
  try {
    const run = await startRun(getDb());
    return ok({ run });
  } catch (err) {
    if (err instanceof ConflictError) return fail('A run is already in progress', 409);
    console.error('[runs:POST]', err);
    return fail('Internal error', 500);
  }
}
