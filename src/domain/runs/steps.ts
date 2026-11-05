import type { Sql } from '@/lib/sql';
import { listAnsweredUnresumed, markResumed, type InboxItem } from '@/domain/inbox/repo';
import type { Settings } from '@/domain/settings/repo';

export interface RunContext {
  sql: Sql;
  resumed: InboxItem[];
  settings: Settings;
  now: Date;
}

export interface RunStep {
  name: string;
  /** Returns the fields to record under `summary.steps[name]`. */
  run(ctx: RunContext): Promise<Record<string, unknown>>;
}

/** Picks up inbox items the user has answered since the last run. */
export const resumeAnsweredInbox: RunStep = {
  name: 'resumeAnsweredInbox',
  async run(ctx) {
    const items = await listAnsweredUnresumed(ctx.sql);
    ctx.resumed = items;
    await markResumed(
      ctx.sql,
      items.map((i) => i.id),
    );
    return { resumed: items.length };
  },
};

/** Steps executed in order by startRun. Later plans append to this list. */
export const runSteps: RunStep[] = [resumeAnsweredInbox];
