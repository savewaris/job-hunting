import { Pool, type ClientConfig } from 'pg';
import {
  parse as parseConnectionString,
  toClientConfig,
  type ConnectionOptions,
} from 'pg-connection-string';

import { ERR_BOTH_SET, ERR_DEV_IN_PROD, createLazySql, openDevStore, resolveDevDbDir } from './devStore';

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

// Query params accepted in DATABASE_URL (case-sensitive, each at most once).
// Everything else is rejected: pg-connection-string copies every query param
// into the config, and pg then honours keys such as `connectionString`, `host`,
// `max`, `stream` or `lookup`, which would defeat the checks below.
const ALLOWED_QUERY_PARAMS = new Set([
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'application_name',
  'connect_timeout',
]);
// Keys the parser itself derives (besides the allowed query params).
const PARSER_DERIVED_KEYS = new Set(['user', 'password', 'host', 'port', 'database', 'ssl']);

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
 * `createPgPool` builds the Pool from it and never from the raw string, and the
 * config holds only an explicit allow-list of keys (no `connectionString`).
 *
 * `pg` interprets connection strings with `pg-connection-string`, whose rules
 * differ from WHATWG `URL` (last duplicate param wins, `?host=` overrides the
 * URL host, `uselibpqcompat` skips verification). So the query is allow-listed
 * and every other fact comes from that same parser.
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

  const seen = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMS.has(key) || seen.has(key)) throw new Error(ERR_CONFLICT);
    seen.add(key);
  }

  let parsed: ConnectionOptions;
  let base: ClientConfig;
  try {
    parsed = parseQuietly(connectionString);
    base = toClientConfig(parsed);
  } catch {
    // Parser/fs errors can embed the input or file paths; replace them.
    throw new Error(ERR_INVALID);
  }

  // Belt and braces: the parser must not see anything we did not allow.
  for (const key of Object.keys(parsed)) {
    if (!ALLOWED_QUERY_PARAMS.has(key) && !PARSER_DERIVED_KEYS.has(key)) {
      throw new Error(ERR_CONFLICT);
    }
  }

  const host = (parsed.host ?? '').trim();
  // Empty host would make pg fall back to PGHOST/localhost; '/...' is a unix socket.
  if (!host || host.startsWith('/')) throw new Error(ERR_INVALID);

  let timeoutMs: number | undefined;
  if (parsed.connect_timeout !== undefined) {
    const seconds = Number(parsed.connect_timeout);
    if (!Number.isInteger(seconds) || seconds <= 0) throw new Error(ERR_INVALID);
    timeoutMs = seconds * 1000;
  }

  if (!LOOPBACK_HOSTS.has(host.toLowerCase())) {
    const mode = typeof parsed.sslmode === 'string' ? parsed.sslmode : '';
    const ssl = base.ssl;
    if (
      !SECURE_SSL_MODES.has(mode) ||
      typeof ssl !== 'object' ||
      ssl === null ||
      ssl.rejectUnauthorized === false
    ) {
      throw new Error(ERR_TLS);
    }
  }

  // Explicit allow-list of keys only; never spread the parsed result.
  const config: ClientConfig = { host };
  if (base.user) config.user = base.user;
  if (base.password) config.password = base.password;
  if (base.port !== undefined) config.port = base.port;
  if (base.database) config.database = base.database;
  if (base.ssl !== undefined && base.ssl !== false) config.ssl = base.ssl;
  if (typeof parsed.application_name === 'string' && parsed.application_name) {
    config.application_name = parsed.application_name;
  }
  if (timeoutMs !== undefined) config.connectionTimeoutMillis = timeoutMs;
  return config;
}

/** Builds the Pool from the validated config, never from the raw string. */
export function createPgPool(connectionString: string): Pool {
  const pool = new Pool(assertSecureConnection(connectionString));
  // An idle client dropped by the pooler must not crash the long-running process.
  pool.on('error', (err) => console.error('[DB_ERROR:pool]', err));
  return pool;
}

export function createPgSql(connectionString: string): Sql {
  const pool = createPgPool(connectionString);
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
  __jobHuntingDevSql?: { dir: string; sql: Sql };
};

export function getDb(): Sql {
  if (override) return override;
  const url = process.env.DATABASE_URL || undefined;
  const devDir = process.env.DEV_DB_DIR || undefined;
  if (devDir) {
    if (url) throw new Error(ERR_BOTH_SET);
    if (process.env.NODE_ENV === 'production') throw new Error(ERR_DEV_IN_PROD);
    const dir = resolveDevDbDir(devDir);
    const cachedDev = globalState.__jobHuntingDevSql;
    if (cachedDev && cachedDev.dir === dir) return cachedDev.sql;
    // Lazy, so getDb stays synchronous; the persistent PGlite opens on first query.
    const sql = createLazySql(() => openDevStore(dir));
    globalState.__jobHuntingDevSql = { dir, sql };
    return sql;
  }
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
