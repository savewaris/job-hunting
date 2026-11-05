import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Sql } from '@/lib/sql';
import { applyMigrations } from '@/lib/migrate';
import { pgliteSql } from '../helpers/testDb';

describe('applyMigrations', () => {
  let dir: string;
  let sql: Sql;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
    fs.writeFileSync(path.join(dir, '0001_a.sql'), 'CREATE TABLE a(id int);');
    fs.writeFileSync(path.join(dir, '0002_b.sql'), 'CREATE TABLE b(id int);');
    sql = pgliteSql();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applies files in filename order and returns their names', async () => {
    const applied = await applyMigrations(sql, dir);
    expect(applied).toEqual(['0001_a.sql', '0002_b.sql']);
  });

  it('is idempotent: second run applies nothing', async () => {
    await applyMigrations(sql, dir);
    expect(await applyMigrations(sql, dir)).toEqual([]);
  });

  it('ignores non-.sql files', async () => {
    fs.writeFileSync(path.join(dir, '.gitkeep'), '');
    fs.writeFileSync(path.join(dir, 'notes.md'), 'x');
    expect(await applyMigrations(sql, dir)).toEqual(['0001_a.sql', '0002_b.sql']);
  });

  it('a failing file rolls back that file and stops', async () => {
    await applyMigrations(sql, dir);
    fs.writeFileSync(
      path.join(dir, '0003_bad.sql'),
      'CREATE TABLE c(id int); SELECT * FROM missing;',
    );
    fs.writeFileSync(path.join(dir, '0004_after.sql'), 'CREATE TABLE d(id int);');

    await expect(applyMigrations(sql, dir)).rejects.toThrow();

    const tables = await sql.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = tables.rows.map((r) => r.table_name);
    expect(names).not.toContain('c');
    expect(names).not.toContain('d');

    const rec = await sql.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    expect(rec.rows.map((r) => r.name)).toEqual(['0001_a.sql', '0002_b.sql']);

    // No transaction left open: after removing the bad file, the rest applies.
    fs.rmSync(path.join(dir, '0003_bad.sql'));
    expect(await applyMigrations(sql, dir)).toEqual(['0004_after.sql']);
  });
});
