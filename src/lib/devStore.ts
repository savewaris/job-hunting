import path from 'node:path';
import type { Sql } from './sql';
import { applyMigrations } from './migrate';
import { wrapPglite } from './pgliteSql';

/**
 * Local verification store: a persistent PGlite directory used instead of
 * Postgres when DEV_DB_DIR is set. Never available in production, never
 * combined with DATABASE_URL. @electric-sql/pglite is imported dynamically and
 * only when the store is actually opened.
 */

export const ERR_BAD_DEV_DIR = 'DEV_DB_DIR must be a relative path inside the project';
export const ERR_BOTH_SET = 'Set either DATABASE_URL or DEV_DB_DIR, not both';
export const ERR_DEV_IN_PROD = 'DEV_DB_DIR is not allowed in production';

/**
 * Validates DEV_DB_DIR and returns its absolute path under the project root
 * (process.cwd()). Rejects absolute paths (POSIX, drive-letter, UNC), drive or
 * URL-style colons, `..` segments, and the project root itself.
 */
export function resolveDevDbDir(dir: string): string {
  const trimmed = dir.trim();
  const bad =
    !trimmed ||
    path.posix.isAbsolute(trimmed) ||
    path.win32.isAbsolute(trimmed) ||
    trimmed.includes(':') ||
    trimmed.split(/[\\/]+/).includes('..');
  if (bad) throw new Error(ERR_BAD_DEV_DIR);
  const root = process.cwd();
  const resolved = path.resolve(root, trimmed);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(ERR_BAD_DEV_DIR);
  return resolved;
}

/** Throws unless the environment is a dev-store one (DEV_DB_DIR set, DATABASE_URL unset). */
export function assertDevOnly(env: NodeJS.ProcessEnv): void {
  if (env.DATABASE_URL) {
    throw new Error(
      'Refusing to seed: DATABASE_URL is set. The seed script writes fake data and only runs against the local dev store; unset DATABASE_URL and set DEV_DB_DIR (for example DEV_DB_DIR=.dev-db).',
    );
  }
  if (!env.DEV_DB_DIR) {
    throw new Error(
      'Refusing to seed: DEV_DB_DIR is not set. The seed script writes fake data and only runs against the local dev store; set DEV_DB_DIR (for example DEV_DB_DIR=.dev-db).',
    );
  }
  resolveDevDbDir(env.DEV_DB_DIR);
}

/** Opens (creating if needed) a PGlite directory and applies the migrations. */
export async function openDevStore(dir: string): Promise<Sql> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(dir);
  const sql = wrapPglite(db);
  try {
    await db.waitReady;
    await applyMigrations(sql, path.resolve(process.cwd(), 'supabase/migrations'));
  } catch (err) {
    // Release the directory so a retry can reopen it.
    await db.close().catch(() => undefined);
    throw err;
  }
  return sql;
}

/**
 * A synchronous Sql whose first use awaits a single shared init. A failed init
 * is not cached: the next call starts it again.
 */
export function createLazySql(open: () => Promise<Sql>): Sql {
  let pending: Promise<Sql> | null = null;
  const ready = (): Promise<Sql> => {
    if (!pending) {
      const attempt = open();
      pending = attempt;
      attempt.catch(() => {
        if (pending === attempt) pending = null;
      });
    }
    return pending;
  };
  return {
    async query<T = Record<string, unknown>>(text: string, params?: unknown[]) {
      return (await ready()).query<T>(text, params);
    },
    async exec(text: string) {
      return (await ready()).exec(text);
    },
  };
}
