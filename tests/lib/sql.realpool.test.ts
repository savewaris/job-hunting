import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { assertSecureConnection, createPgPool } from '@/lib/sql';

// Real `pg` and real `pg-connection-string`: no mocks. Pools are only
// constructed (never queried), then ended.
const CONFLICT_MSG = 'DATABASE_URL has conflicting TLS or host parameters';
const INVALID_MSG = 'DATABASE_URL is not a valid connection URL';

async function withPool<T>(url: string, fn: (pool: Pool) => T): Promise<T> {
  const pool = createPgPool(url);
  try {
    return fn(pool);
  } finally {
    await pool.end();
  }
}

describe('query-param allow-list (real parser)', () => {
  const EVIL = encodeURIComponent('postgres://u:p@evil.example.com/db');
  const EVIL_NOSSL = encodeURIComponent('postgres://u:p@evil.example.com/db?sslmode=disable');
  const remote = 'postgresql://u:p@r.example.com/db';

  it.each([
    `postgresql://u:p@localhost/db?connectionString=${EVIL}`,
    `postgresql://u:p@localhost/db?connectionString=postgres://u:p@evil.example.com/db`,
    `${remote}?sslmode=require&connectionString=${EVIL_NOSSL}`,
    `${remote}?sslmode=require&connectionString=postgres://u:p@evil.example.com/db?sslmode=disable`,
    `postgresql://u:p@localhost/db?max=1`,
    `postgresql://u:p@localhost/db?options=-c%20search_path%3Dx`,
    `postgresql://u:p@localhost/db?stream=x`,
    `postgresql://u:p@localhost/db?lookup=x`,
    `postgresql://u:p@localhost/db?host=remote.example.com`,
    `postgresql://u:p@localhost/db?hostaddr=10.0.0.1`,
    `${remote}?sslmode=require&uselibpqcompat=true`,
    `postgresql://u:p@localhost/db?SSLMODE=disable`,
    `postgresql://u:p@localhost/db?user=evil`,
    `postgresql://u:p@localhost/db?password=evil`,
    `postgresql://u:p@localhost/db?port=1`,
    `${remote}?sslmode=require&sslmode=disable`,
    `${remote}?sslmode=disable&sslmode=require`,
    `postgresql://u:p@localhost/db?application_name=a&application_name=b`,
  ])('rejects %s', (url) => {
    expect(() => assertSecureConnection(url)).toThrow(CONFLICT_MSG);
    expect(() => createPgPool(url)).toThrow(CONFLICT_MSG);
  });

  it('rejects an empty or socket host without falling back to PGHOST/localhost', () => {
    expect(() => assertSecureConnection('postgresql://u:p@/db?sslmode=require')).toThrow(INVALID_MSG);
    expect(() => assertSecureConnection('postgresql:///db')).toThrow(INVALID_MSG);
    expect(() => assertSecureConnection('postgresql://u:p@%2Fvar%2Frun%2Fpg/db')).toThrow(INVALID_MSG);
  });

  it('the validated config contains only allow-listed keys', () => {
    const cfg = assertSecureConnection(
      `${remote}?sslmode=require&application_name=jobs&connect_timeout=5`,
    );
    const allowed = [
      'user',
      'password',
      'host',
      'port',
      'database',
      'ssl',
      'application_name',
      'connectionTimeoutMillis',
    ];
    for (const key of Object.keys(cfg)) expect(allowed).toContain(key);
    expect(cfg).not.toHaveProperty('connectionString');
    expect(cfg.application_name).toBe('jobs');
    expect(cfg.connectionTimeoutMillis).toBe(5000);
  });

  it('rejects a non-numeric connect_timeout', () => {
    expect(() => assertSecureConnection(`${remote}?sslmode=require&connect_timeout=abc`)).toThrow(
      INVALID_MSG,
    );
  });
});

describe('real Pool built from the validated config', () => {
  it('remote sslmode=require: validated host/port/database and verifying TLS', async () => {
    await withPool('postgresql://u:pw@db.example.supabase.com:6543/postgres?sslmode=require', (pool) => {
      const o = pool.options as unknown as Record<string, unknown>;
      expect(o.host).toBe('db.example.supabase.com');
      expect(o.port).toBe(6543);
      expect(o.database).toBe('postgres');
      expect(o.ssl).toBeTruthy();
      expect(typeof o.ssl).toBe('object');
      expect((o.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized).not.toBe(false);
      expect(o).not.toHaveProperty('connectionString');
    });
  });

  it('loopback: loopback host and no ssl', async () => {
    await withPool('postgresql://u:pw@localhost:5432/db', (pool) => {
      const o = pool.options as unknown as Record<string, unknown>;
      expect(o.host).toBe('localhost');
      expect(o.port).toBe(5432);
      expect(o.ssl === undefined || o.ssl === false).toBe(true);
      expect(o).not.toHaveProperty('connectionString');
    });
  });

  it('a bypass attempt never yields a Pool', () => {
    expect(() =>
      createPgPool('postgresql://u:p@localhost/db?connectionString=postgres://u:p@evil.example.com/db'),
    ).toThrow(CONFLICT_MSG);
  });
});
