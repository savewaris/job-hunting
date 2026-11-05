import fs from 'node:fs';
import path from 'node:path';
import type { Sql } from './sql';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Applies every `*.sql` file in `dir` (sorted by filename) that is not yet
 * recorded in `schema_migrations`. Each file runs in its own transaction
 * together with its bookkeeping row; the first failure rolls that file back
 * and stops. Returns the names newly applied.
 */
export async function applyMigrations(sql: Sql, dir: string): Promise<string[]> {
  await sql.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const done = await sql.query<{ name: string }>('SELECT name FROM schema_migrations');
  const already = new Set(done.rows.map((r) => r.name));

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    if (already.has(file)) continue;
    const body = fs.readFileSync(path.join(dir, file), 'utf8');
    try {
      await sql.exec(
        `BEGIN;\n${body}\n;INSERT INTO schema_migrations (name) VALUES (${quote(file)});\nCOMMIT;`,
      );
    } catch (err) {
      await sql.exec('ROLLBACK').catch(() => undefined);
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    applied.push(file);
  }
  return applied;
}
