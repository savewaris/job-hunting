import { getDb } from '../src/lib/sql';
import { fetchGreenhouseChoices } from '../src/domain/ats/greenhouseOptions';
import { normalizeQuestionKey } from '../src/domain/answers/key';
import { loadEnv } from './loadEnv';

loadEnv();

// Adds original answer choices to open question items created before options were stored.
// Stop the dev server first when using the local PGlite store (single-process).
async function main() {
  const sql = await getDb();
  const { rows } = await sql.query<{ id: string; prompt: string; job_url: string }>(
    `SELECT i.id, i.prompt, a.job_url FROM inbox_items i
     JOIN job_applications a ON a.id = i.job_application_id
     WHERE i.kind = 'question' AND i.status = 'open' AND NOT (i.payload ? 'options')`,
  );
  const byUrl = new Map<string, Awaited<ReturnType<typeof fetchGreenhouseChoices>>>();
  let updated = 0;
  for (const r of rows) {
    if (!byUrl.has(r.job_url)) byUrl.set(r.job_url, await fetchGreenhouseChoices(r.job_url));
    const opt = byUrl.get(r.job_url)!.get(normalizeQuestionKey(r.prompt));
    if (!opt) continue;
    await sql.query(`UPDATE inbox_items SET payload = payload || $2::jsonb WHERE id = $1::uuid`, [
      r.id,
      JSON.stringify({ options: opt }),
    ]);
    updated++;
  }
  console.log(`open questions ${rows.length}, given choices ${updated}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
