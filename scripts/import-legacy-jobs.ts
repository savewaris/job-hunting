import fs from 'node:fs';
import path from 'node:path';
import { createPgSql } from '../src/lib/sql';
import { importLegacyJobs } from '../src/domain/applications/legacy';
import type { ScrapedJob } from '../src/types/job';
import { loadEnv } from './loadEnv';

loadEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const file = path.resolve(process.cwd(), 'src/domain/jobs/jobs.json');
  const jobs = JSON.parse(fs.readFileSync(file, 'utf-8')) as ScrapedJob[];
  const sql = createPgSql(url);
  const { imported, skipped } = await importLegacyJobs(sql, jobs);
  console.log(`imported ${imported}, skipped ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
