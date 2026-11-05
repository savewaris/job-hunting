import { PANEL } from './api';
import { NEEDS_MORE_DATA, formatDays, formatPercent } from './format';

export interface MetricsView {
  sentLast7Days: number;
  responseRate: number | null;
  interviewRate: number | null;
  offerRate: number | null;
  medianDaysToFirstReply: number | null;
}

function Tile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3" data-testid="metric">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-slate-100">
        {value ?? <span aria-label="no data">—</span>}
      </dd>
      {value === null && <p className="text-xs text-slate-500">{NEEDS_MORE_DATA}</p>}
    </div>
  );
}

export default function MetricsStrip({ metrics }: { metrics: MetricsView }) {
  return (
    <section aria-labelledby="metrics-heading" className={PANEL}>
      <h2 id="metrics-heading" className="text-lg font-semibold text-slate-100">
        Metrics
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Sent in last 7 days" value={String(metrics.sentLast7Days)} />
        <Tile label="Response rate" value={formatPercent(metrics.responseRate)} />
        <Tile label="Interview rate" value={formatPercent(metrics.interviewRate)} />
        <Tile label="Offer rate" value={formatPercent(metrics.offerRate)} />
        <Tile label="Median days to first reply" value={formatDays(metrics.medianDaysToFirstReply)} />
      </dl>
    </section>
  );
}
