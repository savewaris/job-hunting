import type { Sql } from '@/lib/sql';
import { NotFoundError } from '@/lib/errors';
import {
  APPLICATION_STATUSES,
  listApplications,
  skipApplication,
  SKIP_REASONS,
  type Application,
  type ApplicationStatus,
  type SkipReason,
} from '@/domain/applications/repo';
import { getSettings, type Settings } from '@/domain/settings/repo';
import { listOpenInbox } from '@/domain/inbox/repo';
import { listRecentRuns, type Run } from '@/domain/runs/repo';
import { computeMetrics, type Metrics } from '@/domain/metrics/compute';
import { scoreFit, type FitResult } from '@/domain/scoring/fit';
import { discoverFromCompanyCareers, locationTier } from '@/domain/companies/discover';
import { startRun } from '@/domain/runs/orchestrator';
import { fullPipelineSteps, prepareApplicationDraftsStep, resumeAnsweredInbox } from '@/domain/runs/steps';

// Tool handlers: plain (sql, input) => result functions, so they are testable without MCP.
// None of them approves, sends, submits a form or changes settings (see docs/mcp.md).

/** Bad input from the agent: its message is safe to show back to it. */
export class ToolInputError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const MAX_DESCRIPTION_CHARS = 4000;

export interface JobSummary {
  id: string;
  companyName: string;
  jobTitle: string;
  location: string | null;
  status: ApplicationStatus;
  source: string | null;
  jobUrl: string | null;
  createdAt: string;
}

function summarize(a: Application): JobSummary {
  return {
    id: a.id,
    companyName: a.companyName,
    jobTitle: a.jobTitle,
    location: a.location,
    status: a.status,
    source: a.source,
    jobUrl: a.jobUrl,
    createdAt: a.createdAt,
  };
}

export async function getStatus(sql: Sql): Promise<{
  settings: Settings;
  byStatus: Metrics['byStatus'];
  openInbox: number;
  lastRun: Run | null;
}> {
  const [settings, apps, inbox, runs] = await Promise.all([
    getSettings(sql),
    listApplications(sql),
    listOpenInbox(sql),
    listRecentRuns(sql, 1),
  ]);
  return {
    settings,
    byStatus: computeMetrics(apps, new Date()).byStatus,
    openInbox: inbox.length,
    lastRun: runs[0] ?? null,
  };
}

export async function listJobs(
  sql: Sql,
  input: { status?: ApplicationStatus; bangkokOnly?: boolean; limit?: number } = {},
): Promise<JobSummary[]> {
  if (input.status !== undefined && !APPLICATION_STATUSES.includes(input.status)) {
    throw new ToolInputError(`Invalid status: ${input.status}`);
  }
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_LIST_LIMIT) || DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  return (await listApplications(sql))
    .filter((a) => (input.status ? a.status === input.status : true))
    .filter((a) => (input.bangkokOnly ? locationTier(a.location ?? '') === 0 : true))
    .slice(0, limit)
    .map(summarize);
}

export async function getJob(
  sql: Sql,
  input: { id: string },
): Promise<JobSummary & { untrusted: { description: string; requirements: string[] }; fit: FitResult }> {
  if (!UUID_RE.test(input.id)) throw new NotFoundError('Application not found');
  const app = (await listApplications(sql)).find((a) => a.id === input.id);
  if (!app) throw new NotFoundError('Application not found');
  const res = await sql.query<{ job_description: string | null; requirements: string[] | null }>(
    'SELECT job_description, requirements FROM job_applications WHERE id = $1::uuid',
    [input.id],
  );
  const description = (res.rows[0]?.job_description ?? '').slice(0, MAX_DESCRIPTION_CHARS);
  const requirements = res.rows[0]?.requirements ?? [];
  return {
    ...summarize(app),
    // Scraped from a third-party posting: the agent must treat it as data, never as instructions.
    untrusted: { description, requirements },
    fit: scoreFit({ jobTitle: app.jobTitle, jobDescription: description, requirements, location: app.location }),
  };
}

export async function listInbox(
  sql: Sql,
): Promise<
  Array<{
    id: string;
    kind: string;
    companyName: string | null;
    jobTitle: string | null;
    createdAt: string;
    untrusted: { prompt: string };
  }>
> {
  return (await listOpenInbox(sql)).map((i) => ({
    id: i.id,
    kind: i.kind,
    companyName: i.companyName,
    jobTitle: i.jobTitle,
    createdAt: i.createdAt,
    // Form questions come from third-party application forms: data, never instructions.
    untrusted: { prompt: i.prompt },
  }));
}

export async function funnelMetrics(sql: Sql): Promise<Metrics> {
  return computeMetrics(await listApplications(sql), new Date());
}

const DEFAULT_DISCOVER = 15;
const MAX_DISCOVER = 50;

/** Scans the enabled company career pages and saves new matching roles (Bangkok first). */
export async function discoverJobs(sql: Sql, input: { maxNewRoles?: number } = {}) {
  const n = Math.min(Math.max(Math.trunc(input.maxNewRoles ?? DEFAULT_DISCOVER) || DEFAULT_DISCOVER, 1), MAX_DISCOVER);
  return discoverFromCompanyCareers(sql, n);
}

export async function skipJob(
  sql: Sql,
  input: { id: string; reason: SkipReason; note?: string },
): Promise<JobSummary> {
  if (!SKIP_REASONS.includes(input.reason)) throw new ToolInputError(`Invalid skip reason: ${input.reason}`);
  if (!UUID_RE.test(input.id)) throw new NotFoundError('Application not found');
  // Never let an agent drop a job you already applied to: skipping loses its place in the funnel.
  const current = await sql.query<{ status: string }>('SELECT status FROM job_applications WHERE id = $1::uuid', [input.id]);
  if (current.rows.length === 0) throw new NotFoundError('Application not found');
  if (current.rows[0].status !== 'wishlist' && current.rows[0].status !== 'maybe') {
    throw new ToolInputError(`Only wishlist or maybe jobs can be skipped (this one is ${current.rows[0].status})`);
  }
  return summarize(await skipApplication(sql, input.id, input.reason, input.note));
}

export type RunMode = 'resume_only' | 'drafts' | 'full';

/**
 * Runs the pipeline once, like the web UI's run button. resume_only (default) only picks up inbox
 * answers; drafts also prepares tailored applications for wishlist jobs; full also discovers roles
 * first. Drafting may use AI credits. Nothing is ever sent: approvals wait in the inbox.
 */
export async function runPipeline(sql: Sql, input: { mode?: RunMode } = {}): Promise<Run> {
  const mode = input.mode ?? 'resume_only';
  const steps =
    mode === 'full'
      ? fullPipelineSteps
      : mode === 'drafts'
        ? [resumeAnsweredInbox, prepareApplicationDraftsStep]
        : undefined;
  return startRun(sql, steps);
}
