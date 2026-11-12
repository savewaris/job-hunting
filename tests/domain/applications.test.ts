import { beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/sql';
import { NotFoundError, ConflictError } from '@/lib/errors';
import {
  createApplication,
  listApplications,
  localDateString,
  moveApplication,
  skipApplication,
} from '@/domain/applications/repo';
import { createTestDb } from '../helpers/testDb';

let sql: Sql;

beforeEach(async () => {
  sql = await createTestDb();
});

const base = { companyName: 'Acme', jobTitle: 'Dev' };
// Built from local-time components so the expected local date is timezone independent.
const t1 = new Date(2026, 10, 5, 23, 30, 0);
const t2 = new Date(2026, 10, 6, 9, 0, 0);
const t3 = new Date(2026, 10, 7, 9, 0, 0);

describe('localDateString', () => {
  it('formats the local calendar date of the given instant as YYYY-MM-DD', () => {
    expect(localDateString(new Date(2026, 0, 2, 23, 59, 59))).toBe('2026-01-02');
    expect(localDateString(new Date(2026, 11, 31, 0, 0, 0))).toBe('2026-12-31');
  });
});

describe('createApplication', () => {
  it('creates a wishlist application with mapped fields', async () => {
    const app = await createApplication(sql, {
      ...base,
      jobUrl: 'https://x.test/1',
      location: 'Bangkok',
      salaryRange: '50-70k',
      source: 'facebook',
      externalId: 'abc',
      requirements: ['ts', 'sql'],
      contactMethod: { type: 'email', value: 'hr@x.test' },
      jobDescription: 'desc',
      rawPostContent: 'raw',
    });
    expect(app).toMatchObject({
      companyName: 'Acme',
      jobTitle: 'Dev',
      jobUrl: 'https://x.test/1',
      location: 'Bangkok',
      salaryRange: '50-70k',
      status: 'wishlist',
      source: 'facebook',
      externalId: 'abc',
      appliedDate: null,
      firstResponseAt: null,
      interviewedAt: null,
      offeredAt: null,
      needsInput: false,
    });
    expect(app.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(app.createdAt).toISOString()).toBe(app.createdAt);
  });

  it('rejects an invalid status', async () => {
    await expect(
      createApplication(sql, { ...base, status: 'banana' as never }),
    ).rejects.toThrow();
  });

  it('throws ConflictError for a duplicate source + externalId (partial unique index)', async () => {
    await createApplication(sql, { ...base, source: 'facebook', externalId: 'dup' });
    await expect(
      createApplication(sql, { ...base, source: 'facebook', externalId: 'dup' }),
    ).rejects.toBeInstanceOf(ConflictError);
    const rows = await sql.query('SELECT 1 FROM job_applications');
    expect(rows.rows).toHaveLength(1);
  });

  it('allows several applications with the same source and no externalId', async () => {
    await createApplication(sql, { ...base, source: 'facebook' });
    await createApplication(sql, { ...base, source: 'facebook' });
    const rows = await sql.query('SELECT 1 FROM job_applications');
    expect(rows.rows).toHaveLength(2);
  });

  it('allows the same externalId under different sources', async () => {
    await createApplication(sql, { ...base, source: 'facebook', externalId: 'same' });
    await createApplication(sql, { ...base, source: 'jobsdb', externalId: 'same' });
    const rows = await sql.query('SELECT 1 FROM job_applications');
    expect(rows.rows).toHaveLength(2);
  });
});

describe('moveApplication', () => {
  it('moveApplication to applied sets applied_date to today and status_changed_at', async () => {
    const app = await createApplication(sql, base);
    const moved = await moveApplication(sql, app.id, 'applied', t1);
    expect(moved.status).toBe('applied');
    expect(moved.appliedDate).toBe('2026-11-05');
    expect(moved.statusChangedAt).toBe(t1.toISOString());
  });

  it('moving to interviewing sets first_response_at and interviewed_at once; moving again does not overwrite them', async () => {
    const app = await createApplication(sql, base);
    await moveApplication(sql, app.id, 'applied', t1);
    const first = await moveApplication(sql, app.id, 'interviewing', t2);
    expect(first.firstResponseAt).toBe(t2.toISOString());
    expect(first.interviewedAt).toBe(t2.toISOString());
    await moveApplication(sql, app.id, 'applied', t3);
    const again = await moveApplication(sql, app.id, 'interviewing', t3);
    expect(again.firstResponseAt).toBe(t2.toISOString());
    expect(again.interviewedAt).toBe(t2.toISOString());
    expect(again.statusChangedAt).toBe(t3.toISOString());
  });

  it('moving to rejected after applied sets first_response_at but not interviewed_at', async () => {
    const app = await createApplication(sql, base);
    await moveApplication(sql, app.id, 'applied', t1);
    const rejected = await moveApplication(sql, app.id, 'rejected', t2);
    expect(rejected.firstResponseAt).toBe(t2.toISOString());
    expect(rejected.interviewedAt).toBeNull();
  });

  it('moving to rejected without ever applying does not count as a response', async () => {
    const app = await createApplication(sql, base);
    const rejected = await moveApplication(sql, app.id, 'rejected', t2);
    expect(rejected.firstResponseAt).toBeNull();
  });

  it('moving to offer sets offered_at', async () => {
    const app = await createApplication(sql, base);
    await moveApplication(sql, app.id, 'applied', t1);
    const offer = await moveApplication(sql, app.id, 'offer', t2);
    expect(offer.offeredAt).toBe(t2.toISOString());
    expect(offer.firstResponseAt).toBe(t2.toISOString());
  });

  it('moving applied → wishlist keeps applied_date', async () => {
    const app = await createApplication(sql, base);
    await moveApplication(sql, app.id, 'applied', t1);
    const back = await moveApplication(sql, app.id, 'wishlist', t2);
    expect(back.status).toBe('wishlist');
    expect(back.appliedDate).toBe('2026-11-05');
  });

  it('moveApplication on an unknown id throws NotFoundError and writes nothing', async () => {
    await createApplication(sql, base);
    const before = await sql.query('SELECT * FROM job_applications');
    await expect(
      moveApplication(sql, '00000000-0000-4000-8000-000000000000', 'applied', t1),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(moveApplication(sql, 'not-a-uuid', 'applied', t1)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const after = await sql.query('SELECT * FROM job_applications');
    expect(after.rows).toEqual(before.rows);
  });
});

describe('skipApplication', () => {
  it('skipApplication sets status skipped and stores the reason row', async () => {
    const app = await createApplication(sql, base);
    const skipped = await skipApplication(sql, app.id, 'bad_pay', 'too low');
    expect(skipped.status).toBe('skipped');
    const rows = await sql.query<{ job_application_id: string; reason: string; note: string }>(
      'SELECT job_application_id, reason, note FROM skip_reasons',
    );
    expect(rows.rows).toEqual([{ job_application_id: app.id, reason: 'bad_pay', note: 'too low' }]);
  });

  it('stores a null note when none is given', async () => {
    const app = await createApplication(sql, base);
    await skipApplication(sql, app.id, 'other');
    const rows = await sql.query<{ note: string | null }>('SELECT note FROM skip_reasons');
    expect(rows.rows).toEqual([{ note: null }]);
  });

  it('throws NotFoundError for an unknown id and stores no reason row', async () => {
    await expect(
      skipApplication(sql, '00000000-0000-4000-8000-000000000000', 'bad_pay'),
    ).rejects.toBeInstanceOf(NotFoundError);
    const rows = await sql.query('SELECT 1 FROM skip_reasons');
    expect(rows.rows).toHaveLength(0);
  });
});

describe('listApplications', () => {
  it('returns newest first', async () => {
    const a = await createApplication(sql, { ...base, companyName: 'A' });
    const b = await createApplication(sql, { ...base, companyName: 'B' });
    await sql.query(
      `UPDATE job_applications SET created_at = now() - interval '1 day' WHERE id = $1`,
      [a.id],
    );
    const list = await listApplications(sql);
    expect(list.map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it('listApplications marks needsInput true only while an open inbox item exists', async () => {
    const app = await createApplication(sql, base);
    expect((await listApplications(sql))[0].needsInput).toBe(false);
    await sql.query(
      `INSERT INTO inbox_items (job_application_id, kind, prompt) VALUES ($1, 'question', 'Salary?')`,
      [app.id],
    );
    expect((await listApplications(sql))[0].needsInput).toBe(true);
    await sql.query(`UPDATE inbox_items SET status = 'answered'`);
    expect((await listApplications(sql))[0].needsInput).toBe(false);
  });
});
