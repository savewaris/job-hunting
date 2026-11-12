import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  describe('parser disagreements (pg-connection-string vs WHATWG URL)', () => {
    const CONFLICT_MSG = 'DATABASE_URL has conflicting TLS or host parameters';

    it.each([
      `${remote}?sslmode=require&sslmode=disable`,
      `${remote}?sslmode=disable&sslmode=require`,
      `${remote}?sslmode=require&sslmode=require`,
    ])('rejects duplicate sslmode: %s', (url) => {
      expect(() => assertSecureConnection(url)).toThrow(CONFLICT_MSG);
    });

    it('rejects a host query param on a localhost URL', () => {
      expect(() =>
        assertSecureConnection('postgresql://u:p@localhost/db?host=remote.example.com'),
      ).toThrow(CONFLICT_MSG);
    });

    it('rejects a host query param on a remote URL even with sslmode=require', () => {
      expect(() =>
        assertSecureConnection(
          'postgresql://u:p@remote.example.com/db?sslmode=require&host=other.example.com',
        ),
      ).toThrow(CONFLICT_MSG);
    });

    it('rejects hostaddr', () => {
      expect(() => assertSecureConnection(`${remote}?sslmode=require&hostaddr=10.0.0.1`)).toThrow(
        CONFLICT_MSG,
      );
    });

    it.each([
      `${remote}?uselibpqcompat=true&sslmode=require`,
      `${remote}?sslmode=require&uselibpqcompat=true`,
      `${remote}?sslmode=require&uselibpqcompat=false`,
    ])('rejects uselibpqcompat: %s', (url) => {
      expect(() => assertSecureConnection(url)).toThrow(CONFLICT_MSG);
    });

    it('rejects sslmode=no-verify and a non-postgres scheme', () => {
      expect(() => assertSecureConnection(`${remote}?sslmode=no-verify`)).toThrow(TLS_MSG);
      expect(() => assertSecureConnection('http://u:p@remote.example.com/db?sslmode=require')).toThrow(
        INVALID_MSG,
      );
    });

    it('accepts a single sslmode=require or verify-full on a remote host', () => {
      expect(() => assertSecureConnection(`${remote}?sslmode=require`)).not.toThrow();
      expect(() => assertSecureConnection(`${remote}?sslmode=verify-full`)).not.toThrow();
    });

    it('validates the unmodified string: reads sslrootcert into the returned config', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-'));
      const ca = path.join(dir, 'ca.crt');
      fs.writeFileSync(ca, 'FAKE-CA');
      try {
        const cfg = assertSecureConnection(`${remote}?sslmode=verify-full&sslrootcert=${encodeURIComponent(ca)}`);
        expect((cfg.ssl as { ca?: string }).ca).toBe('FAKE-CA');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a missing sslrootcert file is reported as invalid without leaking the path', () => {
      let message = '';
      try {
        assertSecureConnection(`${remote}?sslmode=verify-full&sslrootcert=/nonexistent/secretdir/ca.crt`);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toBe(INVALID_MSG);
      expect(message).not.toContain('secretdir');
    });

    it('does not emit the sslmode alias deprecation warning', () => {
      const seen: string[] = [];
      const listener = (w: Error) => seen.push(w.message);
      process.on('warning', listener);
      try {
        assertSecureConnection(`${remote}?sslmode=require`);
        assertSecureConnection(`${remote}?sslmode=verify-ca`);
      } finally {
        process.off('warning', listener);
      }
      expect(seen.filter((m) => m.includes('SSL modes'))).toEqual([]);
    });

    describe('returned (validated) config', () => {
      it('has TLS set and verification on for a remote sslmode=require URL', () => {
        const cfg = assertSecureConnection(`${remote}?sslmode=require`);
        expect(cfg.host).toBe('db.example.supabase.com');
        expect(cfg.port).toBe(6543);
        expect(cfg.ssl).toBeTruthy();
        expect(typeof cfg.ssl).toBe('object');
        expect((cfg.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized).not.toBe(false);
        expect(cfg).not.toHaveProperty('connectionString');
      });

      it('has no TLS only for loopback without sslmode', () => {
        for (const url of [
          'postgresql://u:p@localhost:5432/db',
          'postgresql://u:p@127.0.0.1:5432/db',
          'postgresql://u:p@[::1]:5432/db',
        ]) {
          const cfg = assertSecureConnection(url);
          expect(cfg.ssl === undefined || cfg.ssl === false).toBe(true);
        }
      });
    });

    it('never leaks the input in error messages', () => {
      const inputs = [
        'postgresql://u:topsecretpw@localhost/db?host=leak.example.com',
        'postgresql://u:topsecretpw@remote.example.com/db?sslmode=disable',
        'postgresql://u:topsecretpw@remote.example.com/db?sslmode=require&sslmode=disable',
        'postgresql://u:topsecretpw@/db',
        '%%%topsecretpw',
      ];
      for (const input of inputs) {
        try {
          assertSecureConnection(input);
          throw new Error('expected throw');
        } catch (err) {
          const m = (err as Error).message;
          expect(m).not.toContain('topsecretpw');
          expect(m).not.toContain('leak.example.com');
          expect(m).not.toContain('remote.example.com');
        }
      }
    });
  });
});

describe('setDb / getDb', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  afterEach(() => {
    setDb(null);
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

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
