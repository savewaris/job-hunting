import { Pool } from 'pg';
import { parse as parseConnectionString } from 'pg-connection-string';

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /**
   * Multi-statement, no params. Contract: implementations leave no open
   * transaction behind after a failure (they roll back before rethrowing).
   */
  exec(text: string): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SECURE_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);
// Params the parser would read from disk; stripped from the copy we parse so
// the guard never touches the filesystem (pg reads them itself at connect time).
const FILE_PARAMS = ['sslrootcert', 'sslcert', 'sslkey'];

const ERR_INVALID = 'DATABASE_URL is not a valid connection URL';
const ERR_TLS = 'DATABASE_URL must use TLS (add ?sslmode=require)';
const ERR_CONFLICT = 'DATABASE_URL has conflicting TLS or host parameters';

/**
 * Remote databases must be reached over TLS with certificate verification.
 * Loopback hosts are exempt.
 *
 * `pg` interprets the string with `pg-connection-string`, whose rules differ
 * from WHATWG `URL` (last duplicate param wins, `?host=` overrides the URL
 * host, `uselibpqcompat` skips verification). So ambiguous inputs are rejected
 * outright and the remaining facts come from that same parser.
 *
 * Error messages never include the connection string (it holds the password).
 */
export function assertSecureConnection(connectionString: string): void {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(ERR_INVALID);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(ERR_INVALID);
  }

  const names = Array.from(url.searchParams.keys()).map((k) => k.toLowerCase());
  const sslmodeCount = names.filter((k) => k === 'sslmode').length;
  if (
    sslmodeCount > 1 ||
    names.includes('host') ||
    names.includes('hostaddr') ||
    names.includes('uselibpqcompat')
  ) {
    throw new Error(ERR_CONFLICT);
  }

  for (const name of FILE_PARAMS) url.searchParams.delete(name);

  // In non-libpq-compat mode (the only one allowed here) the parser treats
  // prefer/require/verify-ca as aliases of verify-full and emits a process-wide
  // deprecation warning for them. Parse a verify-full copy to keep that noise
  // out of the guard; the mode we validate is the single original param.
  const mode = url.searchParams.get('sslmode') ?? '';
  if (mode === 'prefer' || mode === 'require' || mode === 'verify-ca') {
    url.searchParams.set('sslmode', 'verify-full');
  }

  let parsed: ReturnType<typeof parseConnectionString>;
  try {
    parsed = parseConnectionString(url.toString());
  } catch {
    throw new Error(ERR_INVALID);
  }

  const host = (parsed.host ?? '').toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return;

  const ssl = parsed.ssl;
  const tlsOn = typeof ssl === 'object' && ssl !== null;
  if (!SECURE_SSL_MODES.has(mode) || !tlsOn || ssl.rejectUnauthorized === false) {
    throw new Error(ERR_TLS);
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
