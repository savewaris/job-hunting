import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { getDb, setDb, type Sql } from '@/lib/sql';
import {
  assertDevOnly,
  createLazySql,
  openDevStore,
  resolveDevDbDir,
} from '@/lib/devStore';

type Env = Record<string, string | undefined>;
const env = process.env as Env;
const KEYS = ['DATABASE_URL', 'DEV_DB_DIR', 'NODE_ENV', 'VERCEL_ENV'] as const;
const saved: Env = {};
for (const k of KEYS) saved[k] = env[k];

const globalState = globalThis as unknown as { __jobHuntingDevSql?: unknown };

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
  setDb(null);
  delete globalState.__jobHuntingDevSql;
});

describe('getDb env selection', () => {
  it('getDb uses DATABASE_URL when set', () => {
    delete env.DEV_DB_DIR;
    env.DATABASE_URL = 'postgresql://u:p@localhost/db';
    const db = getDb();
    expect(typeof db.query).toBe('function');
    expect(typeof db.exec).toBe('function');
    expect(getDb()).toBe(db);
  });

  it('getDb throws a clear error when neither variable is set', () => {
    delete env.DATABASE_URL;
    delete env.DEV_DB_DIR;
    expect(() => getDb()).toThrow('DATABASE_URL is not set');
  });

  it('treats empty strings as unset', () => {
    env.DATABASE_URL = '';
    env.DEV_DB_DIR = '';
    expect(() => getDb()).toThrow('DATABASE_URL is not set');
  });

  it('getDb throws when both DATABASE_URL and DEV_DB_DIR are set', () => {
    env.DATABASE_URL = 'postgresql://u:p@localhost/db';
    env.DEV_DB_DIR = '.dev-db';
    expect(() => getDb()).toThrow('Set either DATABASE_URL or DEV_DB_DIR, not both');
  });

  it('getDb refuses DEV_DB_DIR in production or when VERCEL_ENV is set', () => {
    delete env.DATABASE_URL;
    env.DEV_DB_DIR = '.dev-db';
    env.NODE_ENV = 'production';
    expect(() => getDb()).toThrow('DEV_DB_DIR is not allowed in production');
    env.NODE_ENV = 'development';
    env.VERCEL_ENV = 'preview';
    expect(() => getDb()).toThrow('DEV_DB_DIR is not allowed in production');
  });

  it.each([
    '/etc/pgdata',
    'C:\\data\\db',
    'C:/data/db',
    '\\\\server\\share',
    '../outside',
    'a/../../b',
    'a\\..\\b',
    '..',
    '.',
    'memory://',
    'src',
    '.git',
    '.dev-db/sub',
  ])(
    'getDb rejects DEV_DB_DIR=%s',
    (dir) => {
      delete env.DATABASE_URL;
      env.DEV_DB_DIR = dir;
      expect(() => getDb()).toThrow('DEV_DB_DIR must be a relative path inside the project');
    },
  );

  it('getDb returns a lazy cached Sql for DEV_DB_DIR without opening anything', () => {
    delete env.DATABASE_URL;
    env.DEV_DB_DIR = '.dev-db-unit-test-never-opened';
    const db = getDb();
    expect(typeof db.query).toBe('function');
    expect(typeof db.exec).toBe('function');
    expect(getDb()).toBe(db);
  });

  it('the test override still wins over everything', () => {
    env.DATABASE_URL = 'postgresql://u:p@localhost/db';
    env.DEV_DB_DIR = '.dev-db';
    const fake = {} as Sql;
    setDb(fake);
    expect(getDb()).toBe(fake);
  });
});

describe('resolveDevDbDir', () => {
  it('resolves a relative directory under the project', () => {
    const resolved = resolveDevDbDir('.dev-db');
    expect(path.basename(resolved)).toBe('.dev-db');
    expect(path.dirname(resolved)).toBe(process.cwd());
  });
});

describe('assertDevOnly', () => {
  it('passes when DEV_DB_DIR is set and DATABASE_URL is unset', () => {
    expect(() => assertDevOnly({ DEV_DB_DIR: '.dev-db' } as unknown as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('seed-dev refuses when DATABASE_URL is set', () => {
    expect(() =>
      assertDevOnly({ DEV_DB_DIR: '.dev-db', DATABASE_URL: 'postgresql://u:p@localhost/db' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL/);
  });

  it('refuses when DEV_DB_DIR is not set', () => {
    expect(() => assertDevOnly({} as unknown as NodeJS.ProcessEnv)).toThrow(/DEV_DB_DIR/);
    expect(() => assertDevOnly({ DEV_DB_DIR: '' } as unknown as NodeJS.ProcessEnv)).toThrow(/DEV_DB_DIR/);
  });

  it('refuses an invalid DEV_DB_DIR', () => {
    expect(() => assertDevOnly({ DEV_DB_DIR: '../x' } as unknown as NodeJS.ProcessEnv)).toThrow(
      'DEV_DB_DIR must be a relative path inside the project',
    );
  });

  it('explains why in the message', () => {
    expect(() => assertDevOnly({} as unknown as NodeJS.ProcessEnv)).toThrow(/dev|seed|fake/i);
  });
});

describe('openDevStore', () => {
  it('opens a PGlite directory and applies the migrations', async () => {
    const sql = await openDevStore('memory://');
    const names = await sql.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    expect(names.rows.length).toBeGreaterThanOrEqual(2);
    const t = await sql.query<{ n: number }>('SELECT count(*)::int AS n FROM job_applications');
    expect(t.rows[0].n).toBe(0);
  });

  it('exec rolls back on failure (shared wrapper behaviour)', async () => {
    const sql = await openDevStore('memory://');
    await expect(sql.exec('BEGIN; INSERT INTO nope VALUES (1); COMMIT;')).rejects.toThrow();
    const r = await sql.query<{ n: number }>('SELECT count(*)::int AS n FROM job_applications');
    expect(r.rows[0].n).toBe(0);
  });
});

describe('createLazySql', () => {
  function fakeSql(tag: string): Sql {
    return {
      async query<T>() {
        return { rows: [{ tag }] as unknown as T[] };
      },
      async exec() {},
    };
  }

  it('opens once and shares the init across calls', async () => {
    let opens = 0;
    const lazy = createLazySql(async () => {
      opens += 1;
      return fakeSql('a');
    });
    expect(opens).toBe(0);
    await Promise.all([lazy.query('x'), lazy.query('y'), lazy.exec('z')]);
    await lazy.query('again');
    expect(opens).toBe(1);
  });

  it('does not cache a failed init: the next call retries', async () => {
    let opens = 0;
    const lazy = createLazySql(async () => {
      opens += 1;
      if (opens === 1) throw new Error('disk locked');
      return fakeSql('ok');
    });
    await expect(lazy.query('x')).rejects.toThrow('disk locked');
    const res = await lazy.query<{ tag: string }>('x');
    expect(res.rows[0].tag).toBe('ok');
    expect(opens).toBe(2);
  });
});
