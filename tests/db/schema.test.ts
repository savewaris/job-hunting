import { beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/sql';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, pgliteSql } from '../helpers/testDb';

let sql: Sql;

beforeEach(async () => {
  sql = await createTestDb();
});

async function newJob(): Promise<string> {
  const res = await sql.query<{ id: string }>(
    `INSERT INTO job_applications (company_name, job_title) VALUES ('Acme', 'Dev') RETURNING id`,
  );
  return res.rows[0].id;
}

describe('core schema', () => {
  it('app_settings has exactly one row with schedule off and 20 drafts', async () => {
    const res = await sql.query('SELECT schedule_enabled, max_daily_drafts FROM app_settings');
    expect(res.rows).toEqual([{ schedule_enabled: false, max_daily_drafts: 20 }]);
  });

  it('app_settings rejects a second row', async () => {
    await expect(sql.query('INSERT INTO app_settings (id) VALUES (2)')).rejects.toThrow();
  });

  it('app_settings rejects max_daily_drafts 0 and 201', async () => {
    await expect(sql.query('UPDATE app_settings SET max_daily_drafts = 0')).rejects.toThrow();
    await expect(sql.query('UPDATE app_settings SET max_daily_drafts = 201')).rejects.toThrow();
  });

  it('inbox_items rejects an unknown kind', async () => {
    await expect(
      sql.query(`INSERT INTO inbox_items (kind, prompt) VALUES ('bogus', 'hi')`),
    ).rejects.toThrow();
  });

  it('two open questions with the same job and key violate the unique index', async () => {
    const jobId = await newJob();
    const insert = `INSERT INTO inbox_items (job_application_id, kind, prompt, question_key)
                    VALUES ($1, 'question', 'Salary?', 'salary')`;
    await sql.query(insert, [jobId]);
    await expect(sql.query(insert, [jobId])).rejects.toThrow();

    await sql.query(`UPDATE inbox_items SET status = 'answered', decision = 'answered'`);
    await sql.query(insert, [jobId]);
    const open = await sql.query(`SELECT 1 FROM inbox_items WHERE status = 'open'`);
    expect(open.rows).toHaveLength(1);
  });

  it('answer_bank key is unique', async () => {
    const insert = `INSERT INTO answer_bank (key, question_text, answer) VALUES ('salary', 'Salary?', '50k')`;
    await sql.query(insert);
    await expect(sql.query(insert)).rejects.toThrow();
  });

  it('deleting a job_application cascades to inbox_items and skip_reasons', async () => {
    const jobId = await newJob();
    await sql.query(
      `INSERT INTO inbox_items (job_application_id, kind, prompt) VALUES ($1, 'error', 'boom')`,
      [jobId],
    );
    await sql.query(`INSERT INTO skip_reasons (job_application_id, reason) VALUES ($1, 'too far')`, [jobId]);

    await sql.query('DELETE FROM job_applications WHERE id = $1', [jobId]);

    expect((await sql.query('SELECT 1 FROM inbox_items')).rows).toHaveLength(0);
    expect((await sql.query('SELECT 1 FROM skip_reasons')).rows).toHaveLength(0);
  });

  it('enables RLS with no policies on every table the migration creates', async () => {
    const tables = ['inbox_items', 'answer_bank', 'skip_reasons', 'app_settings', 'runs', 'job_applications'];
    const rls = await sql.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)`,
      [tables],
    );
    expect(rls.rows).toHaveLength(tables.length);
    for (const row of rls.rows) expect(row.relrowsecurity, row.relname).toBe(true);

    const policies = await sql.query(
      `SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [tables],
    );
    expect(policies.rows).toEqual([]);
  });
});

describe('migration 0001 idempotency', () => {
  const file = path.resolve(process.cwd(), 'supabase/migrations/0001_auto_apply_core.sql');

  it('can be re-run on an already migrated database', async () => {
    const db = await createTestDb();
    await db.exec(fs.readFileSync(file, 'utf8'));
    const res = await db.query('SELECT count(*)::int AS n FROM app_settings');
    expect(res.rows).toEqual([{ n: 1 }]);
  });

  it('upgrades a pre-existing job_applications table that has user_id and a permissive policy', async () => {
    const db = pgliteSql();
    await db.exec(`
      CREATE TABLE public.job_applications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        company_name text NOT NULL,
        job_title text NOT NULL,
        status text DEFAULT 'wishlist'
      );
      ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Permissive (no-auth) access to job applications"
        ON public.job_applications FOR ALL USING (true);
      INSERT INTO public.job_applications (company_name, job_title) VALUES ('Old', 'Row');
    `);
    await db.exec(fs.readFileSync(file, 'utf8'));
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'job_applications' AND column_name IN ('user_id', 'source', 'offered_at')`,
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(['offered_at', 'source', 'user_id']);
    expect((await db.query('SELECT 1 FROM job_applications')).rows).toHaveLength(1);
    const pol = await db.query(`SELECT 1 FROM pg_policies WHERE tablename = 'job_applications'`);
    expect(pol.rows).toEqual([]);
  });
});

describe('runs single running index', () => {
  it('rejects a second running row', async () => {
    const db = await createTestDb();
    await db.query(`INSERT INTO runs (status) VALUES ('running')`);
    await expect(db.query(`INSERT INTO runs (status) VALUES ('running')`)).rejects.toThrow();
  });

  it('allows succeeded and failed rows next to a running row', async () => {
    const db = await createTestDb();
    await db.query(`INSERT INTO runs (status) VALUES ('succeeded')`);
    await db.query(`INSERT INTO runs (status) VALUES ('running')`);
    await db.query(`INSERT INTO runs (status) VALUES ('failed')`);
    const res = await db.query('SELECT count(*)::int AS n FROM runs');
    expect(res.rows).toEqual([{ n: 3 }]);
  });

  it('migration 0002 can be re-run', async () => {
    const db = await createTestDb();
    const file = path.resolve(process.cwd(), 'supabase/migrations/0002_runs_single_running.sql');
    await db.exec(fs.readFileSync(file, 'utf8'));
  });
});
