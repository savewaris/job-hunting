import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Sql } from '@/lib/sql';
import { applyMigrations } from '@/lib/migrate';

/** Fresh in-memory PGlite with supabase/migrations applied. */
export async function createTestDb(): Promise<Sql> {
  const db = new PGlite();
  const sql: Sql = {
    async query<T = Record<string, unknown>>(text: string, params?: unknown[]) {
      const res = await db.query<T>(text, params);
      return { rows: res.rows };
    },
    async exec(text: string) {
      await db.exec(text);
    },
  };
  await applyMigrations(sql, path.resolve(process.cwd(), 'supabase/migrations'));
  return sql;
}
