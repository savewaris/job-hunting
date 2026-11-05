import { Pool, type ClientConfig } from 'pg';
import {
  parse as parseConnectionString,
  toClientConfig,
  type ConnectionOptions,
} from 'pg-connection-string';

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

const ERR_INVALID = 'DATABASE_URL is not a valid connection URL';
const ERR_TLS = 'DATABASE_URL must use TLS (add ?sslmode=require)';
const ERR_CONFLICT = 'DATABASE_URL has conflicting TLS or host parameters';

const SSL_ALIAS_WARNING = /^SECURITY WARNING: The SSL modes/;

/**
 * Runs the pg-connection-string parser on the original, unmodified string,
 * dropping only its process-wide "require/prefer/verify-ca are aliases of
 * verify-full" deprecation warning. Any other warning passes through.
 */
function parseQuietly(connectionString: string): ConnectionOptions {
  const original = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === 'string' ? warning : warning.message;
    if (SSL_ALIAS_WARNING.test(text)) return;
    return (original as (...a: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    return parseConnectionString(connectionString);
  } finally {
    process.emitWarning = original;
  }
}

/**
 * Remote databases must be reached over TLS with certificate verification.
 * Loopback hosts are exempt. Returns the exact pg config that was validated;
 * `createPgSql` builds the Pool from it, never from the raw string.
 *
 * `pg` interprets connection strings with `pg-connection-string`, whose rules
 * differ from WHATWG `URL` (last duplicate param wins, `?host=` overrides the
 * URL host, `uselibpqcompat` skips verification). So ambiguous inputs are
 * rejected outright and every other fact comes from that same parser.
 *
 * Error messages never include the connection string (it holds the password).
 */
export function assertSecureConnection(connectionString: string): ClientConfig {
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
  if (
    url.searchParams.getAll('sslmode').length > 1 ||
    names.filter((k) => k === 'sslmode').length > 1 ||
    names.includes('host') ||
    names.includes('hostaddr') ||
    names.includes('uselibpqcompat')
  ) {
    throw new Error(ERR_CONFLICT);
  }

  let parsed: ConnectionOptions;
  let config: ClientConfig;
  try {
    parsed = parseQuietly(connectionString);
    config = toClientConfig(parsed);
  } catch {
    // Parser/fs errors can embed the input or file paths; replace them.
    throw new Error(ERR_INVALID);
  }

  const host = (parsed.host ?? '').toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return config;

  const mode = typeof parsed.sslmode === 'string' ? parsed.sslmode : '';
  const ssl = config.ssl;
  if (
    !SECURE_SSL_MODES.has(mode) ||
    typeof ssl !== 'object' ||
    ssl === null ||
    ssl.rejectUnauthorized === false
  ) {
    throw new Error(ERR_TLS);
  }
  return config;
}

export function createPgSql(connectionString: string): Sql {
  // Validated == used: the Pool gets the guard's config, not the raw string.
  const config = assertSecureConnection(connectionString);
  const pool = new Pool({ ...config });
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
