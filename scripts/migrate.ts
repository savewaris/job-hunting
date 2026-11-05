import path from 'node:path';
import { createPgSql } from '../src/lib/sql';
import { applyMigrations } from '../src/lib/migrate';
import { loadEnv } from './loadEnv';

loadEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const sql = createPgSql(url);
  const applied = await applyMigrations(sql, path.resolve(process.cwd(), 'supabase/migrations'));
  console.log(applied.length ? `Applied:\n${applied.map((n) => `  ${n}`).join('\n')}` : 'No new migrations.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
