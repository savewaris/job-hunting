import type { PGlite } from '@electric-sql/pglite';
import type { Sql } from './sql';

/**
 * Wraps a PGlite instance in the Sql shape. Type-only import: this module never
 * loads PGlite itself, so it is safe to import from production code paths.
 */
export function wrapPglite(db: PGlite): Sql {
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
