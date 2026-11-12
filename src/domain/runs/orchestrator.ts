import type { Sql } from '@/lib/sql';
import { ConflictError } from '@/lib/errors';
import { getSettings } from '@/domain/settings/repo';
import { RUN_COLS, toRun, type Run, type RunRow, type RunStatus } from './repo';
import { runSteps, type RunContext, type RunStep } from './steps';

export const STALE_RUN_MINUTES = 30;
export const MAX_ERROR_LENGTH = 300;

const PG_UNIQUE_VIOLATION = '23505';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, MAX_ERROR_LENGTH) : 'Unknown error';
}

/** JSON text for the summary; falls back to a minimal failure summary if it cannot be serialised. */
function serialise(
  status: RunStatus,
  summary: Record<string, unknown>,
): { status: RunStatus; json: string } {
  try {
    return { status, json: JSON.stringify(summary) };
  } catch {
    return {
      status: 'failed',
      json: JSON.stringify({ error: 'Run summary could not be saved', failedStep: summary.failedStep }),
    };
  }
}

/**
 * Runs the steps in order and records the outcome in `runs`.
 *
 * At most one run is `running` at a time; the unique index `runs_single_running`
 * makes that race-safe, so a concurrent start fails with ConflictError. A running
 * row older than 30 minutes is considered dead and is marked failed first.
 *
 * Once the row is inserted it always ends as `succeeded` or `failed`, whatever a
 * step does.
 */
export async function startRun(
  sql: Sql,
  steps: RunStep[] = runSteps,
  now: Date = new Date(),
): Promise<Run> {
  const cutoff = new Date(now.getTime() - STALE_RUN_MINUTES * 60 * 1000).toISOString();
  await sql.query(
    `UPDATE runs SET status = 'failed', finished_at = $2::timestamptz, summary = '{"error":"stale"}'::jsonb
     WHERE status = 'running' AND started_at < $1::timestamptz`,
    [cutoff, now.toISOString()],
  );

  let runId: string;
  try {
    const inserted = await sql.query<{ id: string }>(
      `INSERT INTO runs (status, started_at) VALUES ('running', $1::timestamptz) RETURNING id`,
      [now.toISOString()],
    );
    runId = inserted.rows[0].id;
  } catch (err) {
    if ((err as { code?: string } | null)?.code === PG_UNIQUE_VIOLATION) {
      throw new ConflictError('A run is already in progress');
    }
    throw err;
  }

  let status: RunStatus = 'failed';
  const stepResults: Record<string, unknown> = {};
  const summary: Record<string, unknown> = { steps: stepResults };
  let current: string | null = null;
  try {
    const ctx: RunContext = { sql, resumed: [], settings: await getSettings(sql), now };
    for (const step of steps) {
      current = step.name;
      stepResults[step.name] = await step.run(ctx);
    }
    status = 'succeeded';
  } catch (err) {
    // A step threw (or loading settings failed, in which case no step is current).
    summary.error = errorMessage(err);
    if (current !== null) summary.failedStep = current;
  }
  return finish(sql, runId, status, summary);
}

async function finish(
  sql: Sql,
  runId: string,
  status: RunStatus,
  summary: Record<string, unknown>,
): Promise<Run> {
  const out = serialise(status, summary);
  try {
    const res = await sql.query<RunRow>(
      `UPDATE runs SET status = $2, finished_at = now(), summary = $3::jsonb
       WHERE id = $1 AND status = 'running' RETURNING ${RUN_COLS}`,
      [runId, out.status, out.json],
    );
    return toRun(res.rows[0]);
  } catch {
    const fallback = JSON.stringify({ error: 'Run summary could not be saved' });
    const res = await sql.query<RunRow>(
      `UPDATE runs SET status = 'failed', finished_at = now(), summary = $2::jsonb
       WHERE id = $1 RETURNING ${RUN_COLS}`,
      [runId, fallback],
    );
    return toRun(res.rows[0]);
  }
}
