import { Pool } from 'pg';

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Multi-statement, no params. */
  exec(text: string): Promise<void>;
}

export function createPgSql(connectionString: string): Sql {
  const pool = new Pool({ connectionString });
  return {
    async query<T = Record<string, unknown>>(text: string, params?: unknown[]) {
      const res = await pool.query(text, params as unknown[] | undefined);
      return { rows: res.rows as T[] };
    },
    async exec(text: string) {
      // Dedicated client so a failed multi-statement script cannot leave a
      // pooled connection stuck inside an aborted transaction.
      const client = await pool.connect();
      try {
        await client.query(text);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

// Cached on globalThis so Next.js dev-mode module re-evaluation never opens a
// second connection pool.
const globalState = globalThis as unknown as {
  __jobHuntingSqlOverride?: Sql | null;
  __jobHuntingPgSql?: { url: string; sql: Sql };
};

export function getDb(): Sql {
  if (globalState.__jobHuntingSqlOverride) return globalState.__jobHuntingSqlOverride;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const cached = globalState.__jobHuntingPgSql;
  if (cached && cached.url === url) return cached.sql;
  const sql = createPgSql(url);
  globalState.__jobHuntingPgSql = { url, sql };
  return sql;
}

/** Test/dev override. Pass null to clear it. */
export function setDb(sql: Sql | null): void {
  globalState.__jobHuntingSqlOverride = sql;
}
