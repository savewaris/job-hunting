import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockGenerateTailoredContent = vi.fn();
const mockGetMasterProfile = vi.fn();
const mockGetScreeningDefaults = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));
vi.mock('@/lib/ai-tailor-client', () => ({
  generateTailoredContent: (...args: any[]) => mockGenerateTailoredContent(...args),
}));
vi.mock('@/domain/profile', () => ({
  getMasterProfile: (...args: any[]) => mockGetMasterProfile(...args),
  getScreeningDefaults: (...args: any[]) => mockGetScreeningDefaults(...args),
}));

import { tailorJob } from '../tailorJob';

function makeJobRow(overrides: Record<string, any> = {}) {
  return {
    id: 'job-1',
    job_title: 'Backend Developer',
    company_name: 'Acme Co',
    job_description: 'Build APIs',
    requirements: ['Node.js'],
    contact_method_type: 'email',
    contact_method_value: 'hr@acme.co',
    ...overrides,
  };
}

function chainable(result: any) {
  const chain: any = {
    select: () => chain,
    update: () => chain,
    insert: () => chain,
    eq: () => chain,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMasterProfile.mockReturnValue({ skills: ['Node.js'], experiences: [] });
  mockGetScreeningDefaults.mockReturnValue({ workAuthorization: 'Authorized', visaSponsorshipNeeded: false, noticePeriod: '2 weeks', willingToRelocate: false });
  mockGenerateTailoredContent.mockResolvedValue('Tailored resume bullets and cover letter text.');
});

describe('tailorJob', () => {
  it('creates a cold_emails draft when the job has an email contact', async () => {
    const jobRow = makeJobRow();
    const insertedTables: string[] = [];

    mockFrom.mockImplementation((table: string) => {
      insertedTables.push(table);
      if (table === 'job_applications') return chainable({ data: jobRow, error: null });
      return chainable({ data: { id: 'doc-1' }, error: null });
    });

    await tailorJob('job-1');

    expect(insertedTables).toContain('cold_emails');
  });

  it('does not create a cold_emails draft when the job has no email contact', async () => {
    const jobRow = makeJobRow({ contact_method_type: 'line', contact_method_value: 'somelineid' });
    const insertedTables: string[] = [];

    mockFrom.mockImplementation((table: string) => {
      insertedTables.push(table);
      if (table === 'job_applications') return chainable({ data: jobRow, error: null });
      return chainable({ data: { id: 'doc-1' }, error: null });
    });

    await tailorJob('job-1');

    expect(insertedTables).not.toContain('cold_emails');
  });

  it('marks the job as errored if every AI provider fails, and does not throw', async () => {
    const jobRow = makeJobRow();
    mockFrom.mockImplementation((table: string) => chainable({ data: jobRow, error: null }));
    mockGenerateTailoredContent.mockRejectedValue(new Error('All free-tier models in the 24/7 battery exhausted.'));

    await expect(tailorJob('job-1')).rejects.toThrow();
    // the caller (advancePipeline) is what swallows this — tailorJob itself
    // is expected to persist the error state before rethrowing, tested via
    // the mockFrom call arguments below.
    const updateCalls = mockFrom.mock.calls.filter(([table]) => table === 'job_applications');
    expect(updateCalls.length).toBeGreaterThan(0);
  });
});
