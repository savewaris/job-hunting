import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Sql } from '@/lib/sql';
import { applyMigrations } from '@/lib/migrate';

/** Wraps a fresh in-memory PGlite in the Sql shape (no migrations applied). */
export function pgliteSql(): Sql {
  const db = new PGlite();
  return {
    async query<T = Record<string, unknown>>(text: string, params?: unknown[]) {
      const res = await db.query<T>(text, params);
      return { rows: res.rows };
    },
    async exec(text: string) {
      try {
        await db.exec(text);
      } catch (err) {
        // Sql.exec contract: leave no open transaction after a failure.
        await db.exec('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
  };
}

/** Fresh in-memory PGlite with supabase/migrations applied. */
export async function createTestDb(): Promise<Sql> {
  const sql = pgliteSql();
  await applyMigrations(sql, path.resolve(process.cwd(), 'supabase/migrations'));
  return sql;
}
