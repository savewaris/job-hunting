import { Pool } from 'pg';

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /**
   * Multi-statement, no params. Contract: implementations leave no open
   * transaction behind after a failure (they roll back before rethrowing).
   */
  exec(text: string): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SECURE_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);

/**
 * Remote databases must be reached over TLS. Loopback hosts are exempt.
 * Error messages never include the connection string (it holds the password).
 */
export function assertSecureConnection(connectionString: string): void {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL is not a valid connection URL');
  }
  if (LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return;
  const mode = url.searchParams.get('sslmode');
  if (!mode || !SECURE_SSL_MODES.has(mode)) {
    throw new Error('DATABASE_URL must use TLS (add ?sslmode=require)');
  }
}

export function createPgSql(connectionString: string): Sql {
  assertSecureConnection(connectionString);
  const pool = new Pool({ connectionString });
  // An idle client dropped by the pooler must not crash the long-running process.
  pool.on('error', (err) => console.error('[DB_ERROR:pool]', err));
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

// Test-only override; module-scoped so it can never leak via globalThis.
let override: Sql | null = null;

// The pg Pool is cached on globalThis so Next.js dev-mode module re-evaluation
// never opens a second connection pool.
const globalState = globalThis as unknown as {
  __jobHuntingPgSql?: { url: string; sql: Sql };
};

export function getDb(): Sql {
  if (override) return override;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const cached = globalState.__jobHuntingPgSql;
  if (cached && cached.url === url) return cached.sql;
  const sql = createPgSql(url);
  globalState.__jobHuntingPgSql = { url, sql };
  return sql;
}

/** Test-only override (NODE_ENV must be "test"). Pass null to clear it. */
export function setDb(sql: Sql | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setDb is only available when NODE_ENV is "test"');
  }
  override = sql;
}
