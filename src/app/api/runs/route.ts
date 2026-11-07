import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { ConflictError } from '@/lib/errors';
import { listRecentRuns } from '@/domain/runs/repo';
import { startRun } from '@/domain/runs/orchestrator';
import {
  fullPipelineSteps,
  prepareApplicationDraftsStep,
  resumeAnsweredInbox,
} from '@/domain/runs/steps';

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

export async function POST(req: Request): Promise<Response> {
  try {
    let mode: 'resume_only' | 'drafts' | 'full' = 'resume_only';
    try {
      const text = await req.text();
      if (text.trim()) {
        const body = JSON.parse(text) as { mode?: string };
        if (body.mode === 'full') mode = 'full';
        else if (body.mode === 'drafts') mode = 'drafts';
      }
    } catch {
      // Empty or non-JSON body defaults to resume_only
    }
    const steps =
      mode === 'full'
        ? fullPipelineSteps
        : mode === 'drafts'
          ? [resumeAnsweredInbox, prepareApplicationDraftsStep]
          : undefined;
    const run = await startRun(getDb(), steps);
    return ok({ run });
  } catch (err) {
    if (err instanceof ConflictError) return fail('A run is already in progress', 409);
    console.error('[runs:POST]', err);
    return fail('Internal error', 500);
  }
}
