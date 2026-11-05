import type { Sql } from '@/lib/sql';

export type RunStatus = 'running' | 'succeeded' | 'failed';

export interface Run {
  id: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  summary: Record<string, unknown>;
}

export const RUN_COLS = 'id, status, started_at, finished_at, summary';

export interface RunRow {
  id: string;
  status: RunStatus;
  started_at: Date | string;
  finished_at: Date | string | null;
  summary: Record<string, unknown> | string | null;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toSummary(value: RunRow['summary']): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return value ?? {};
}

export function toRun(r: RunRow): Run {
  return {
    id: r.id,
    status: r.status,
    startedAt: iso(r.started_at),
    finishedAt: r.finished_at === null ? null : iso(r.finished_at),
    summary: toSummary(r.summary),
  };
}

/** Most recent runs, newest first. */
export async function listRecentRuns(sql: Sql, limit = 5): Promise<Run[]> {
  const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 5;
  const res = await sql.query<RunRow>(
    `SELECT ${RUN_COLS} FROM runs ORDER BY started_at DESC, id DESC LIMIT $1`,
    [n],
  );
  return res.rows.map(toRun);
}
