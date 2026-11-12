import type { Sql } from '@/lib/sql';

export interface Settings {
  scheduleEnabled: boolean;
  maxDailyDrafts: number;
}

export const MIN_DAILY_DRAFTS = 1;
export const MAX_DAILY_DRAFTS = 200;
export const ERR_MAX_DAILY_DRAFTS = 'maxDailyDrafts must be an integer between 1 and 200';

interface Row {
  schedule_enabled: boolean;
  max_daily_drafts: number;
}

function toSettings(r: Row): Settings {
  return { scheduleEnabled: r.schedule_enabled, maxDailyDrafts: r.max_daily_drafts };
}

export async function getSettings(sql: Sql): Promise<Settings> {
  const res = await sql.query<Row>(
    'SELECT schedule_enabled, max_daily_drafts FROM app_settings WHERE id = 1',
  );
  if (res.rows.length === 0) throw new Error('app_settings row is missing');
  return toSettings(res.rows[0]);
}

/**
 * Updates the editable settings. Only `maxDailyDrafts` can be changed;
 * `scheduleEnabled` is deliberately never written here (scheduling is not built).
 * Throws RangeError for a non-integer or a value outside 1-200.
 */
export async function updateSettings(
  sql: Sql,
  patch: { maxDailyDrafts?: number },
): Promise<Settings> {
  const value = patch.maxDailyDrafts;
  if (value === undefined) return getSettings(sql);
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_DAILY_DRAFTS ||
    value > MAX_DAILY_DRAFTS
  ) {
    throw new RangeError(ERR_MAX_DAILY_DRAFTS);
  }
  const res = await sql.query<Row>(
    `UPDATE app_settings SET max_daily_drafts = $1 WHERE id = 1
     RETURNING schedule_enabled, max_daily_drafts`,
    [value],
  );
  if (res.rows.length === 0) throw new Error('app_settings row is missing');
  return toSettings(res.rows[0]);
}
