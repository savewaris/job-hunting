import { localDateString } from '@/domain/applications/repo';
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
} from '@/domain/applications/types';

export interface Metrics {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  /** Applications that have an appliedDate. */
  applied: number;
  /** Applications whose appliedDate is within [today - 7 days, today] (local dates). */
  sentLast7Days: number;
  /** Fractions in 0..1; null when the denominator is 0. */
  responseRate: number | null;
  interviewRate: number | null;
  offerRate: number | null;
  /** Whole calendar days from appliedDate to first response; null when there are no data points. */
  medianDaysToFirstReply: number | null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** Whole calendar days from YYYY-MM-DD `from` to YYYY-MM-DD `to` (DST-safe via UTC arithmetic). */
function calendarDaysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeMetrics(apps: Application[], now: Date): Metrics {
  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<
    ApplicationStatus,
    number
  >;

  const today = localDateString(now);
  const weekAgo = localDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));

  let applied = 0;
  let sentLast7Days = 0;
  let responded = 0;
  let interviewedOfApplied = 0;
  let interviewed = 0;
  let offered = 0;
  const replyDays: number[] = [];

  for (const a of apps) {
    if (Object.prototype.hasOwnProperty.call(byStatus, a.status)) byStatus[a.status] += 1;

    if (a.interviewedAt) {
      interviewed += 1;
      if (a.offeredAt) offered += 1;
    }

    if (!a.appliedDate) continue;
    applied += 1;
    if (a.appliedDate >= weekAgo && a.appliedDate <= today) sentLast7Days += 1;
    if (a.interviewedAt) interviewedOfApplied += 1;
    if (a.firstResponseAt) {
      responded += 1;
      const days = calendarDaysBetween(
        a.appliedDate,
        localDateString(new Date(a.firstResponseAt)),
      );
      replyDays.push(Math.max(0, days));
    }
  }

  return {
    total: apps.length,
    byStatus,
    applied,
    sentLast7Days,
    responseRate: ratio(responded, applied),
    interviewRate: ratio(interviewedOfApplied, applied),
    offerRate: ratio(offered, interviewed),
    medianDaysToFirstReply: median(replyDays),
  };
}
