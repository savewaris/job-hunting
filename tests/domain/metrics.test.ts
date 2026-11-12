import { describe, expect, it } from 'vitest';
import { computeMetrics } from '@/domain/metrics/compute';
import { APPLICATION_STATUSES, type Application } from '@/domain/applications/types';

// All dates are built from local components so the tests pass in any machine timezone.
const NOW = new Date(2026, 10, 5, 12, 0, 0); // 2026-11-05 local noon

function app(over: Partial<Application> = {}): Application {
  return {
    id: 'x',
    companyName: 'Acme',
    jobTitle: 'Dev',
    jobUrl: null,
    location: null,
    salaryRange: null,
    status: 'applied',
    source: null,
    externalId: null,
    appliedDate: null,
    statusChangedAt: null,
    firstResponseAt: null,
    interviewedAt: null,
    offeredAt: null,
    createdAt: new Date(2026, 9, 1, 9, 0, 0).toISOString(),
    needsInput: false,
    ...over,
  };
}

/** ISO timestamp for a local date/time (month is 1-based). */
function localIso(y: number, m: number, d: number, h = 12): string {
  return new Date(y, m - 1, d, h, 0, 0).toISOString();
}

describe('computeMetrics', () => {
  it('empty list gives zeros and null rates, no NaN', () => {
    const m = computeMetrics([], NOW);
    expect(m.total).toBe(0);
    expect(m.applied).toBe(0);
    expect(m.sentLast7Days).toBe(0);
    expect(m.responseRate).toBeNull();
    expect(m.interviewRate).toBeNull();
    expect(m.offerRate).toBeNull();
    expect(m.medianDaysToFirstReply).toBeNull();
    for (const s of APPLICATION_STATUSES) expect(m.byStatus[s]).toBe(0);
  });

  it('applied with no replies gives responseRate 0', () => {
    const m = computeMetrics(
      [app({ appliedDate: '2026-11-01' }), app({ appliedDate: '2026-11-02' })],
      NOW,
    );
    expect(m.applied).toBe(2);
    expect(m.responseRate).toBe(0);
    expect(m.interviewRate).toBe(0);
    expect(m.medianDaysToFirstReply).toBeNull();
  });

  it('3 applied, 1 replied, 1 interviewed → 1/3 and 1/3', () => {
    const m = computeMetrics(
      [
        app({
          appliedDate: '2026-11-01',
          firstResponseAt: localIso(2026, 11, 2),
          interviewedAt: localIso(2026, 11, 3),
        }),
        app({ appliedDate: '2026-11-01' }),
        app({ appliedDate: '2026-11-02' }),
      ],
      NOW,
    );
    expect(m.responseRate).toBeCloseTo(1 / 3, 10);
    expect(m.interviewRate).toBeCloseTo(1 / 3, 10);
  });

  it('rates only count apps that also have appliedDate, so they never exceed 1', () => {
    const m = computeMetrics(
      [
        app({ appliedDate: '2026-11-01', firstResponseAt: localIso(2026, 11, 2) }),
        app({ appliedDate: null, firstResponseAt: localIso(2026, 11, 2), interviewedAt: localIso(2026, 11, 3) }),
      ],
      NOW,
    );
    expect(m.applied).toBe(1);
    expect(m.responseRate).toBe(1);
    expect(m.interviewRate).toBe(0);
  });

  it('offerRate is offers over interviewed, null when nobody interviewed', () => {
    const none = computeMetrics([app({ appliedDate: '2026-11-01' })], NOW);
    expect(none.offerRate).toBeNull();

    const m = computeMetrics(
      [
        app({ interviewedAt: localIso(2026, 11, 3), offeredAt: localIso(2026, 11, 4) }),
        app({ interviewedAt: localIso(2026, 11, 3) }),
        app({ interviewedAt: localIso(2026, 11, 3) }),
        app({ interviewedAt: localIso(2026, 11, 3) }),
      ],
      NOW,
    );
    expect(m.offerRate).toBe(0.25);
  });

  it('an offer without an interview does not count in the offerRate numerator', () => {
    const m = computeMetrics(
      [app({ interviewedAt: localIso(2026, 11, 3) }), app({ offeredAt: localIso(2026, 11, 4) })],
      NOW,
    );
    expect(m.offerRate).toBe(0);
  });

  it('sentLast7Days counts day 7 and excludes day 8', () => {
    const m = computeMetrics(
      [
        app({ appliedDate: '2026-11-05' }), // today
        app({ appliedDate: '2026-10-29' }), // exactly 7 days ago
        app({ appliedDate: '2026-10-28' }), // 8 days ago
      ],
      NOW,
    );
    expect(m.sentLast7Days).toBe(2);
  });

  it('sentLast7Days excludes a future-dated appliedDate', () => {
    const m = computeMetrics([app({ appliedDate: '2026-11-06' })], NOW);
    expect(m.applied).toBe(1);
    expect(m.sentLast7Days).toBe(0);
  });

  it('sentLast7Days is correct across a month boundary', () => {
    const now = new Date(2026, 2, 3, 12, 0, 0); // 2026-03-03
    const m = computeMetrics(
      [
        app({ appliedDate: '2026-02-24' }), // exactly 7 days earlier
        app({ appliedDate: '2026-02-23' }), // 8 days earlier
        app({ appliedDate: '2026-03-01' }),
      ],
      now,
    );
    expect(m.sentLast7Days).toBe(2);
  });

  it('median of an odd number of reply times is the middle value', () => {
    const m = computeMetrics(
      [
        app({ appliedDate: '2026-11-01', firstResponseAt: localIso(2026, 11, 2) }), // 1
        app({ appliedDate: '2026-11-01', firstResponseAt: localIso(2026, 11, 3) }), // 2
        app({ appliedDate: '2026-11-01', firstResponseAt: localIso(2026, 11, 5) }), // 4
      ],
      NOW,
    );
    expect(m.medianDaysToFirstReply).toBe(2);
  });

  it('median of an even number of reply times averages the middle two', () => {
    const m = computeMetrics(
      [
        app({ appliedDate: '2026-11-01', firstResponseAt: localIso(2026, 11, 2) }), // 1
        app({ appliedDate: '2026-11-01', firstResponseAt: localIso(2026, 11, 4) }), // 3
      ],
      NOW,
    );
    expect(m.medianDaysToFirstReply).toBe(2);

    const half = computeMetrics(
      [
        app({ appliedDate: '2026-11-01', firstResponseAt: localIso(2026, 11, 2) }), // 1
        app({ appliedDate: '2026-11-01', firstResponseAt: localIso(2026, 11, 3) }), // 2
      ],
      NOW,
    );
    expect(half.medianDaysToFirstReply).toBe(1.5);
  });

  it('reply time uses calendar days across a month boundary and clamps negatives to 0', () => {
    const m = computeMetrics(
      [
        app({ appliedDate: '2026-02-27', firstResponseAt: localIso(2026, 3, 2) }), // 3 days
        app({ appliedDate: '2026-11-03', firstResponseAt: localIso(2026, 11, 1) }), // -2 -> 0
      ],
      NOW,
    );
    expect(m.medianDaysToFirstReply).toBe(1.5);
  });

  it('reply time ignores apps without appliedDate', () => {
    const m = computeMetrics(
      [app({ appliedDate: null, firstResponseAt: localIso(2026, 11, 2) })],
      NOW,
    );
    expect(m.medianDaysToFirstReply).toBeNull();
  });

  it('byStatus has all seven keys even when zero', () => {
    const m = computeMetrics([app({ status: 'offer' }), app({ status: 'offer' })], NOW);
    expect(Object.keys(m.byStatus).sort()).toEqual([...APPLICATION_STATUSES].sort());
    expect(m.byStatus.offer).toBe(2);
    expect(m.byStatus.maybe).toBe(0);
    expect(m.total).toBe(2);
  });

  it('a legacy status counts in total but not in byStatus', () => {
    const legacy = app({ status: 'ghosted' as unknown as Application['status'] });
    const m = computeMetrics([legacy, app({ status: 'applied' })], NOW);
    expect(m.total).toBe(2);
    expect(Object.values(m.byStatus).reduce((a, b) => a + b, 0)).toBe(1);
    expect(Object.keys(m.byStatus)).toHaveLength(7);
  });
});
