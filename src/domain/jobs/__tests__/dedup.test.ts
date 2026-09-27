import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

describe('computeExternalId', () => {
  it('produces the same id for the same text', async () => {
    const { computeExternalId } = await import('../index');
    const text = 'Full Stack Developer needed, salary 40k THB, email hr@company.com';
    expect(computeExternalId(text)).toBe(computeExternalId(text));
  });

  it('produces different ids for different text', async () => {
    const { computeExternalId } = await import('../index');
    expect(computeExternalId('post A')).not.toBe(computeExternalId('post B'));
  });

  it('is insensitive to leading/trailing whitespace', async () => {
    const { computeExternalId } = await import('../index');
    expect(computeExternalId('  same post  ')).toBe(computeExternalId('same post'));
  });
});

describe('createJobFromFacebookPaste', () => {
  function chainable(result: any) {
    const chain: any = {
      select: () => chain,
      insert: () => chain,
      eq: () => chain,
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
    };
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the existing row instead of inserting when the same text was already pasted', async () => {
    const { createJobFromFacebookPaste } = await import('../index');
    const existingRow = { id: 'existing-1', job_title: 'Backend Developer', company_name: 'Acme', pipeline_stage: 'new', external_id: 'whatever' };

    let insertCalled = false;
    mockFrom.mockReturnValue({
      ...chainable({ data: existingRow, error: null }),
      insert: () => {
        insertCalled = true;
        return chainable({ data: existingRow, error: null });
      },
    });

    const result = await createJobFromFacebookPaste('Same post text', 'https://facebook.com/post/1');

    expect(result.id).toBe('existing-1');
    expect(insertCalled).toBe(false);
  });
});
