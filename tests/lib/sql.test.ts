import { describe, it, expect, afterEach } from 'vitest';
import { assertSecureConnection, getDb, setDb } from '@/lib/sql';
import { pgliteSql } from '../helpers/testDb';

const TLS_MSG = 'DATABASE_URL must use TLS (add ?sslmode=require)';
const INVALID_MSG = 'DATABASE_URL is not a valid connection URL';

describe('assertSecureConnection', () => {
  const remote = 'postgresql://user:pw@db.example.supabase.com:6543/postgres';

  it('rejects a remote host without sslmode', () => {
    expect(() => assertSecureConnection(remote)).toThrow(TLS_MSG);
  });

  it.each(['disable', 'allow', 'prefer'])('rejects sslmode=%s on a remote host', (mode) => {
    expect(() => assertSecureConnection(`${remote}?sslmode=${mode}`)).toThrow(TLS_MSG);
  });

  it.each(['require', 'verify-ca', 'verify-full'])('accepts sslmode=%s on a remote host', (mode) => {
    expect(() => assertSecureConnection(`${remote}?sslmode=${mode}`)).not.toThrow();
  });

  it.each([
    'postgresql://u:p@localhost:5432/db',
    'postgresql://u:p@127.0.0.1:5432/db',
    'postgresql://u:p@[::1]:5432/db',
  ])('accepts loopback without sslmode: %s', (url) => {
    expect(() => assertSecureConnection(url)).not.toThrow();
  });

  it('rejects an unparseable string without echoing it', () => {
    const garbage = 'not a url with secret-pw-12345';
    let message = '';
    try {
      assertSecureConnection(garbage);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe(INVALID_MSG);
    expect(message).not.toContain('secret');
    expect(message).not.toContain('12345');
  });
});

describe('setDb / getDb', () => {
  afterEach(() => setDb(null));

  it('getDb honours the override under NODE_ENV=test and clears with null', () => {
    const db = pgliteSql();
    setDb(db);
    expect(getDb()).toBe(db);
    setDb(null);
    delete process.env.DATABASE_URL;
    expect(() => getDb()).toThrow('DATABASE_URL is not set');
  });

  it('setDb throws outside NODE_ENV=test', () => {
    const original = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    try {
      expect(() => setDb(pgliteSql())).toThrow('setDb is only available when NODE_ENV is "test"');
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = original;
    }
  });
});
