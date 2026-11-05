import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Sql } from '@/lib/sql';
import { applyMigrations } from '@/lib/migrate';
import { wrapPglite } from '@/lib/pgliteSql';

/** Wraps a fresh in-memory PGlite in the Sql shape (no migrations applied). */
export function pgliteSql(): Sql {
  return wrapPglite(new PGlite());
}

/** Fresh in-memory PGlite with supabase/migrations applied. */
export async function createTestDb(): Promise<Sql> {
  const sql = pgliteSql();
  await applyMigrations(sql, path.resolve(process.cwd(), 'supabase/migrations'));
  return sql;
}
