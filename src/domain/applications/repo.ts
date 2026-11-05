import type { Sql } from '@/lib/sql';
import { ConflictError, NotFoundError } from '@/lib/errors';
import {
  APPLICATION_STATUSES,
  SKIP_REASONS,
  type Application,
  type ApplicationStatus,
  type CreateApplicationInput,
  type SkipReason,
} from './types';

export * from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns of an Application, read from a relation aliased `a`. Dates come back as text. */
const SELECT_COLS = `
  a.id, a.company_name, a.job_title, a.job_url, a.location, a.salary_range, a.status,
  a.source, a.external_id, a.applied_date::text AS applied_date,
  a.status_changed_at, a.first_response_at, a.interviewed_at, a.offered_at, a.created_at,
  EXISTS (
    SELECT 1 FROM inbox_items i WHERE i.job_application_id = a.id AND i.status = 'open'
  ) AS needs_input`;

interface Row {
  id: string;
  company_name: string;
  job_title: string;
  job_url: string | null;
  location: string | null;
  salary_range: string | null;
  status: ApplicationStatus;
  source: string | null;
  external_id: string | null;
  applied_date: string | null;
  status_changed_at: Date | string | null;
  first_response_at: Date | string | null;
  interviewed_at: Date | string | null;
  offered_at: Date | string | null;
  created_at: Date | string;
  needs_input: boolean;
}

function iso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toApplication(r: Row): Application {
  return {
    id: r.id,
    companyName: r.company_name,
    jobTitle: r.job_title,
    jobUrl: r.job_url,
    location: r.location,
    salaryRange: r.salary_range,
    status: r.status,
    source: r.source,
    externalId: r.external_id,
    appliedDate: r.applied_date,
    statusChangedAt: iso(r.status_changed_at),
    firstResponseAt: iso(r.first_response_at),
    interviewedAt: iso(r.interviewed_at),
    offeredAt: iso(r.offered_at),
    createdAt: iso(r.created_at) as string,
    needsInput: r.needs_input,
  };
}

/** Local calendar date of `now` (machine timezone) as YYYY-MM-DD. */
export function localDateString(now: Date): string {
  const y = String(now.getFullYear()).padStart(4, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function createApplication(
  sql: Sql,
  input: CreateApplicationInput,
): Promise<Application> {
  const status = input.status ?? 'wishlist';
  if (!APPLICATION_STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
  let res;
  try {
    res = await sql.query<Row>(
      `WITH ins AS (
         INSERT INTO job_applications (
           company_name, job_title, job_url, location, salary_range, status, source, external_id,
           job_description, requirements, contact_method, raw_post_content, status_changed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11::jsonb, $12, now())
         RETURNING *
       )
       SELECT ${SELECT_COLS} FROM ins a`,
      [
        input.companyName,
        input.jobTitle,
        input.jobUrl ?? null,
        input.location ?? null,
        input.salaryRange ?? null,
        status,
        input.source ?? null,
        input.externalId ?? null,
        input.jobDescription ?? null,
        input.requirements ?? null,
        input.contactMethod ? JSON.stringify(input.contactMethod) : null,
        input.rawPostContent ?? null,
      ],
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new ConflictError('An application with this source and external id already exists');
    }
    throw err;
  }
  return toApplication(res.rows[0]);
}

export async function listApplications(sql: Sql): Promise<Application[]> {
  const res = await sql.query<Row>(
    `SELECT ${SELECT_COLS} FROM job_applications a ORDER BY a.created_at DESC, a.id DESC`,
  );
  return res.rows.map(toApplication);
}

/**
 * Moves an application to `status` in one statement. Milestone timestamps are
 * only ever set the first time (COALESCE), so history is never overwritten:
 * - applied: applied_date (local date of `now`)
 * - interviewing / offer: first_response_at; interviewing also interviewed_at,
 *   offer also offered_at
 * - rejected: first_response_at, but only if the application was ever applied to
 */
export async function moveApplication(
  sql: Sql,
  id: string,
  status: ApplicationStatus,
  now: Date = new Date(),
): Promise<Application> {
  if (!APPLICATION_STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
  if (!UUID_RE.test(id)) throw new NotFoundError('Application not found');
  const res = await sql.query<Row>(
    `WITH upd AS (
       UPDATE job_applications SET
         status = $2::text,
         status_changed_at = $3::timestamptz,
         updated_at = $3::timestamptz,
         applied_date = CASE WHEN $2::text = 'applied'
           THEN COALESCE(applied_date, $4::date) ELSE applied_date END,
         first_response_at = CASE
           WHEN $2::text IN ('interviewing', 'offer')
             OR ($2::text = 'rejected' AND applied_date IS NOT NULL)
           THEN COALESCE(first_response_at, $3::timestamptz) ELSE first_response_at END,
         interviewed_at = CASE WHEN $2::text = 'interviewing'
           THEN COALESCE(interviewed_at, $3::timestamptz) ELSE interviewed_at END,
         offered_at = CASE WHEN $2::text = 'offer'
           THEN COALESCE(offered_at, $3::timestamptz) ELSE offered_at END
       WHERE id = $1::uuid
       RETURNING *
     )
     SELECT ${SELECT_COLS} FROM upd a`,
    [id, status, now.toISOString(), localDateString(now)],
  );
  if (res.rows.length === 0) throw new NotFoundError('Application not found');
  return toApplication(res.rows[0]);
}

/** Marks an application skipped and records the reason, atomically (single statement). */
export async function skipApplication(
  sql: Sql,
  id: string,
  reason: SkipReason,
  note?: string,
  now: Date = new Date(),
): Promise<Application> {
  if (!SKIP_REASONS.includes(reason)) throw new Error(`Invalid skip reason: ${reason}`);
  if (!UUID_RE.test(id)) throw new NotFoundError('Application not found');
  const res = await sql.query<Row>(
    `WITH upd AS (
       UPDATE job_applications SET
         status = 'skipped',
         status_changed_at = $2::timestamptz,
         updated_at = $2::timestamptz
       WHERE id = $1::uuid
       RETURNING *
     ), ins AS (
       INSERT INTO skip_reasons (job_application_id, reason, note)
       SELECT id, $3::text, $4::text FROM upd
     )
     SELECT ${SELECT_COLS} FROM upd a`,
    [id, now.toISOString(), reason, note ?? null],
  );
  if (res.rows.length === 0) throw new NotFoundError('Application not found');
  return toApplication(res.rows[0]);
}
