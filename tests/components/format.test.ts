import { describe, it, expect } from 'vitest';
import {
  formatPercent,
  formatDays,
  resumedText,
  runErrorText,
} from '@/components/dashboard/format';

describe('formatPercent', () => {
  it('renders 0..1 fractions as whole percents', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(2 / 3)).toBe('67%');
    expect(formatPercent(1)).toBe('100%');
  });
  it('returns null (rendered as an em dash) when there is no data', () => {
    expect(formatPercent(null)).toBeNull();
    expect(formatPercent(undefined)).toBeNull();
    expect(formatPercent(Number.NaN)).toBeNull();
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('formatDays', () => {
  it('pluralises and keeps half days', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(0)).toBe('0 days');
    expect(formatDays(2.5)).toBe('2.5 days');
  });
  it('returns null without data', () => {
    expect(formatDays(null)).toBeNull();
  });
});

describe('run summary text', () => {
  const ok = { status: 'succeeded', summary: { steps: { resumeAnsweredInbox: { resumed: 1 } } } };
  it('reads the resume count from summary.steps', () => {
    expect(resumedText(ok)).toBe('Resumed 1 answered items');
    expect(
      resumedText({ status: 'succeeded', summary: { steps: { resumeAnsweredInbox: { resumed: 0 } } } }),
    ).toBe('Resumed 0 answered items');
  });
  it('is null when no count was recorded', () => {
    expect(resumedText(null)).toBeNull();
    expect(resumedText({ status: 'failed', summary: { error: 'x' } })).toBeNull();
    expect(resumedText({ status: 'succeeded', summary: { steps: 'oops' } })).toBeNull();
  });
  it('shows the error text of a failed run, with the step when known', () => {
    expect(runErrorText({ status: 'failed', summary: { error: 'boom', failedStep: 'resumeAnsweredInbox' } })).toBe(
      'boom (step: resumeAnsweredInbox)',
    );
    expect(runErrorText({ status: 'failed', summary: {} })).toBe('Run failed');
    expect(runErrorText(ok)).toBeNull();
  });
});
