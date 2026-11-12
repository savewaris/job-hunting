import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/sql';
import { ConflictError } from '@/lib/errors';
import { createApplication } from '@/domain/applications/repo';
import { createInboxItem, resolveInboxItem } from '@/domain/inbox/repo';
import { listRecentRuns } from '@/domain/runs/repo';
import { startRun } from '@/domain/runs/orchestrator';
import { runSteps, type RunStep } from '@/domain/runs/steps';
import { createTestDb } from '../helpers/testDb';

let sql: Sql;

beforeEach(async () => {
  sql = await createTestDb();
});

const okStep = (name: string, result: Record<string, unknown> = { done: true }): RunStep => ({
  name,
  run: vi.fn(async () => result),
});

describe('startRun', () => {
  it('exports resumeAnsweredInbox as the only default step', () => {
    expect(runSteps.map((s) => s.name)).toEqual(['resumeAnsweredInbox']);
  });

  it('startRun with the default steps succeeds with resumed 0 on an empty inbox', async () => {
    const run = await startRun(sql);
    expect(run.status).toBe('succeeded');
    expect(run.finishedAt).not.toBeNull();
    expect(run.summary).toEqual({ steps: { resumeAnsweredInbox: { resumed: 0 } } });
  });

  it('startRun resumes answered items once — a second run reports resumed 0', async () => {
    const job = await createApplication(sql, { companyName: 'Acme', jobTitle: 'Dev' });
    const item = await createInboxItem(sql, {
      jobApplicationId: job.id,
      kind: 'question',
      prompt: 'Expected salary?',
    });
    await resolveInboxItem(sql, item.id, { decision: 'answered', answer: '50k' });

    const first = await startRun(sql);
    expect(first.summary).toEqual({ steps: { resumeAnsweredInbox: { resumed: 1 } } });
    const second = await startRun(sql);
    expect(second.summary).toEqual({ steps: { resumeAnsweredInbox: { resumed: 0 } } });
  });

  it('passes settings and resumed items to the steps via the context', async () => {
    let seen: unknown;
    const step: RunStep = {
      name: 'peek',
      run: async (ctx) => {
        seen = { settings: ctx.settings, resumed: ctx.resumed, hasNow: ctx.now instanceof Date };
        return {};
      },
    };
    await startRun(sql, [step]);
    expect(seen).toEqual({
      settings: { scheduleEnabled: false, maxDailyDrafts: 20 },
      resumed: [],
      hasNow: true,
    });
  });

  it('a throwing step marks the run failed, records failedStep, keeps earlier results and skips later steps', async () => {
    const first = okStep('first', { n: 1 });
    const boom: RunStep = {
      name: 'boom',
      run: async () => {
        throw new Error('kaboom');
      },
    };
    const later = okStep('later');
    const run = await startRun(sql, [first, boom, later]);
    expect(run.status).toBe('failed');
    expect(run.finishedAt).not.toBeNull();
    expect(run.summary).toEqual({
      steps: { first: { n: 1 } },
      error: 'kaboom',
      failedStep: 'boom',
    });
    expect(later.run).not.toHaveBeenCalled();
    const stored = (await listRecentRuns(sql, 1))[0];
    expect(stored.status).toBe('failed');
  });

  it("a step that throws a non-Error value stores 'Unknown error'", async () => {
    const run = await startRun(sql, [
      {
        name: 'weird',
        run: async () => {
          throw 'a string';
        },
      },
    ]);
    expect(run.status).toBe('failed');
    expect(run.summary.error).toBe('Unknown error');
    expect(run.summary.failedStep).toBe('weird');
  });

  it('truncates a very long error message to 300 chars', async () => {
    const run = await startRun(sql, [
      {
        name: 'long',
        run: async () => {
          throw new Error('x'.repeat(1000));
        },
      },
    ]);
    expect(run.summary.error).toBe('x'.repeat(300));
  });

  it('a second startRun while one is running throws ConflictError and leaves the first untouched', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: RunStep = {
      name: 'slow',
      run: async () => {
        await gate;
        return { slow: true };
      },
    };
    const firstRun = startRun(sql, [slow]);
    // let the first run insert its row and block inside the step
    await vi.waitFor(async () => {
      const res = await sql.query(`SELECT 1 FROM runs WHERE status = 'running'`);
      expect(res.rows).toHaveLength(1);
    });
    await expect(startRun(sql, [okStep('other')])).rejects.toBeInstanceOf(ConflictError);
    release();
    const done = await firstRun;
    expect(done.status).toBe('succeeded');
    expect(done.summary).toEqual({ steps: { slow: { slow: true } } });
    expect(await listRecentRuns(sql)).toHaveLength(1);
  });

  it('a running row older than 30 minutes is marked failed stale and a new run starts', async () => {
    const now = new Date('2026-11-05T12:00:00.000Z');
    const old = new Date(now.getTime() - 31 * 60 * 1000).toISOString();
    const stale = await sql.query<{ id: string }>(
      `INSERT INTO runs (status, started_at) VALUES ('running', $1) RETURNING id`,
      [old],
    );
    const run = await startRun(sql, [okStep('s')], now);
    expect(run.status).toBe('succeeded');
    expect(run.id).not.toBe(stale.rows[0].id);
    const row = await sql.query<{ status: string; summary: unknown; finished_at: Date | null }>(
      `SELECT status, summary, finished_at FROM runs WHERE id = $1`,
      [stale.rows[0].id],
    );
    expect(row.rows[0].status).toBe('failed');
    expect(row.rows[0].summary).toEqual({ error: 'stale' });
    expect(row.rows[0].finished_at).not.toBeNull();
  });

  it('a running row younger than 30 minutes still blocks a new run', async () => {
    const now = new Date('2026-11-05T12:00:00.000Z');
    const recent = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    await sql.query(`INSERT INTO runs (status, started_at) VALUES ('running', $1)`, [recent]);
    await expect(startRun(sql, [okStep('s')], now)).rejects.toBeInstanceOf(ConflictError);
  });

  it('closes the run with a minimal fallback summary when Postgres jsonb rejects the summary (e.g. NUL byte)', async () => {
    const badJsonb: RunStep = {
      name: 'badJsonb',
      run: async () => ({ bad: 'hello\u0000world' }),
    };
    const run = await startRun(sql, [badJsonb]);
    expect(run.status).toBe('failed');
    expect(run.finishedAt).not.toBeNull();
    expect(run.summary).toEqual({ error: 'Run summary could not be saved' });
  });
});

describe('listRecentRuns', () => {
  it('returns newest first and respects the limit', async () => {
    for (let i = 0; i < 4; i++) {
      await sql.query(
        `INSERT INTO runs (status, started_at, finished_at) VALUES ('succeeded', $1, $1)`,
        [new Date(Date.UTC(2026, 10, 1 + i)).toISOString()],
      );
    }
    const runs = await listRecentRuns(sql, 2);
    expect(runs).toHaveLength(2);
    expect(runs[0].startedAt).toBe('2026-11-04T00:00:00.000Z');
    expect(runs[1].startedAt).toBe('2026-11-03T00:00:00.000Z');
  });
});
