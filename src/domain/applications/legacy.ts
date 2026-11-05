import type { Sql } from '@/lib/sql';
import { ConflictError } from '@/lib/errors';
import type { ScrapedJob } from '@/types/job';
import { createApplication } from './repo';
import type { CreateApplicationInput } from './types';

/** Full `job_applications` row, as the legacy ScrapedJob adapter needs it. */
export interface ApplicationDbRow {
  id: string;
  company_name: string;
  job_title: string;
  job_url: string | null;
  location: string | null;
  salary_range: string | null;
  source: string | null;
  external_id: string | null;
  job_description: string | null;
  requirements: string[] | null;
  contact_method: ScrapedJob['contactMethod'] | null;
  raw_post_content: string | null;
  created_at: Date | string;
}

const SCRAPED_SOURCES: readonly ScrapedJob['source'][] = [
  'facebook',
  'greenhouse',
  'ashby',
  'jobsdb',
  'remoteok',
  'manual',
];

function toSource(source: string | null): ScrapedJob['source'] {
  return SCRAPED_SOURCES.find((s) => s === source) ?? 'manual';
}

/** Pure adapter so `/api/jobs` keeps the response shape FacebookScraperCard expects. */
export function rowToScrapedJob(row: ApplicationDbRow): ScrapedJob {
  const created = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  return {
    id: row.external_id ?? row.id,
    source: toSource(row.source),
    jobTitle: row.job_title,
    companyName: row.company_name,
    jobUrl: row.job_url ?? '',
    location: row.location ?? '',
    salaryRange: row.salary_range ?? undefined,
    jobDescription: row.job_description ?? '',
    requirements: row.requirements ?? [],
    contactMethod: row.contact_method ?? undefined,
    rawPostContent: row.raw_post_content ?? undefined,
    createdAt: created.toISOString(),
  };
}

export async function listScrapedJobs(sql: Sql): Promise<ScrapedJob[]> {
  const res = await sql.query<ApplicationDbRow>(
    `SELECT id, company_name, job_title, job_url, location, salary_range, source, external_id,
            job_description, requirements, contact_method, raw_post_content, created_at
       FROM job_applications
      ORDER BY created_at DESC, id DESC`,
  );
  return res.rows.map(rowToScrapedJob);
}

export function fromScrapedJob(job: ScrapedJob): CreateApplicationInput {
  return {
    companyName: job.companyName,
    jobTitle: job.jobTitle,
    jobUrl: job.jobUrl || undefined,
    location: job.location || undefined,
    salaryRange: job.salaryRange || undefined,
    status: 'wishlist',
    source: job.source,
    externalId: job.id,
    jobDescription: job.jobDescription || undefined,
    requirements: job.requirements,
    contactMethod: job.contactMethod,
    rawPostContent: job.rawPostContent,
    createdAt: job.createdAt,
  };
}

/** Idempotent by (source, external_id = job.id): already-present jobs are counted as skipped. */
export async function importLegacyJobs(
  sql: Sql,
  jobs: ScrapedJob[],
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  for (const job of jobs) {
    try {
      await createApplication(sql, fromScrapedJob(job));
      imported += 1;
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      skipped += 1;
    }
  }
  return { imported, skipped };
}
