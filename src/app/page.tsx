import { getDb } from '@/lib/sql';
import { listApplications } from '@/domain/applications/repo';
import { listOpenInbox } from '@/domain/inbox/repo';
import { computeMetrics } from '@/domain/metrics/compute';
import { getSettings } from '@/domain/settings/repo';
import { listRecentRuns } from '@/domain/runs/repo';
import RunPanel from '@/components/dashboard/RunPanel';
import InboxPanel from '@/components/dashboard/InboxPanel';
import MetricsStrip from '@/components/dashboard/MetricsStrip';
import Board from '@/components/dashboard/Board';
import SettingsPanel from '@/components/dashboard/SettingsPanel';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const sql = getDb();
  const [inbox, applications, settings, runs] = await Promise.all([
    listOpenInbox(sql),
    listApplications(sql),
    getSettings(sql),
    listRecentRuns(sql, 1),
  ]);
  const metrics = computeMetrics(applications, new Date());

  return (
    <main className="mx-auto w-full max-w-7xl min-w-0 space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">Your job applications, and what needs you.</p>
        </div>
        <RunPanel lastRun={runs[0] ?? null} />
      </div>

      <InboxPanel
        items={inbox.map((i) => ({
          id: i.id,
          companyName: i.companyName,
          jobTitle: i.jobTitle,
          kind: i.kind,
          prompt: i.prompt,
          payload: i.payload,
        }))}
      />
      <MetricsStrip metrics={metrics} />
      <Board
        applications={applications.map((a) => ({
          id: a.id,
          companyName: a.companyName,
          jobTitle: a.jobTitle,
          location: a.location,
          status: a.status,
          needsInput: a.needsInput,
        }))}
      />
      <SettingsPanel maxDailyDrafts={settings.maxDailyDrafts} scheduleEnabled={settings.scheduleEnabled} />
    </main>
  );
}
