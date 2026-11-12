/** Pure display helpers for the dashboard (kept free of React so they can be unit-tested). */

export const NEEDS_MORE_DATA = 'needs more data';

/** 0..1 fraction (or null) as a whole-percent string, or null when there is no data. */
export function formatPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${Math.round(value * 100)}%`;
}

/** Median days to first reply, or null when there is no data. */
export function formatDays(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

interface RunLike {
  status: string;
  summary: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Count recorded by the resume step, or null if the run did not record one. */
export function resumedCount(run: RunLike | null | undefined): number | null {
  const steps = asRecord(run?.summary?.steps);
  const step = asRecord(steps?.resumeAnsweredInbox);
  const n = step?.resumed;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** "Resumed N answered items" for a finished run that recorded the count, else null. */
export function resumedText(run: RunLike | null | undefined): string | null {
  const n = resumedCount(run);
  return n === null ? null : `Resumed ${n} answered items`;
}

/** The error text of a failed run (with the failed step when known), else null. */
export function runErrorText(run: RunLike | null | undefined): string | null {
  if (!run || run.status !== 'failed') return null;
  const error = typeof run.summary?.error === 'string' ? run.summary.error : 'Run failed';
  const step = typeof run.summary?.failedStep === 'string' ? run.summary.failedStep : null;
  return step ? `${error} (step: ${step})` : error;
}

export const SKIP_REASON_LABELS: Record<string, string> = {
  too_senior: 'Too senior',
  bad_pay: 'Bad pay',
  not_interested_company: 'Not interested in the company',
  wrong_location: 'Wrong location',
  other: 'Other',
};

export const STATUS_LABELS: Record<string, string> = {
  maybe: 'Maybe',
  wishlist: 'Wishlist',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  skipped: 'Skipped',
};
