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

let writeCalls: { table: string; op: 'update' | 'insert'; payload: any }[];

function chainable(table: string, result: any) {
  const chain: any = {
    select: () => chain,
    update: (payload: any) => {
      writeCalls.push({ table, op: 'update', payload });
      return chain;
    },
    insert: (payload: any) => {
      writeCalls.push({ table, op: 'insert', payload });
      return chain;
    },
    eq: () => chain,
    in: () => chain,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    // Real supabase-js query builders are themselves thenable — awaiting one
    // directly (without a terminal .single()/.maybeSingle()) still resolves
    // to { data, error }. Without this, `await supabase.from(x).update(y)`
    // in production code would await a plain object instead of `result`.
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  writeCalls = [];
  mockGetMasterProfile.mockReturnValue({
    fullName: 'Jane Doe',
    summary: 'Experienced engineer',
    skills: ['Node.js'],
    experiences: [],
  });
  mockGetScreeningDefaults.mockReturnValue({
    workAuthorization: 'Authorized',
    visaSponsorshipNeeded: false,
    noticePeriod: '2 weeks',
    willingToRelocate: false,
  });
  mockGenerateTailoredContent.mockResolvedValue('Tailored resume bullets and cover letter text.');
});

describe('tailorJob', () => {
  it('creates a cold_emails draft when the job has an email contact', async () => {
    const jobRow = makeJobRow();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'job_applications') return chainable(table, { data: jobRow, error: null });
      return chainable(table, { data: { id: 'doc-1' }, error: null });
    });

    await tailorJob('job-1');

    expect(writeCalls.some(c => c.table === 'cold_emails' && c.op === 'insert')).toBe(true);
  });

  it('does not create a cold_emails draft when the job has no email contact', async () => {
    const jobRow = makeJobRow({ contact_method_type: 'line', contact_method_value: 'somelineid' });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'job_applications') return chainable(table, { data: jobRow, error: null });
      return chainable(table, { data: { id: 'doc-1' }, error: null });
    });

    await tailorJob('job-1');

    expect(writeCalls.some(c => c.table === 'cold_emails')).toBe(false);
  });

  it('does nothing (does not call the AI) when the job cannot be claimed, e.g. already tailoring/tailored/sent', async () => {
    mockFrom.mockImplementation((table: string) => chainable(table, { data: null, error: null }));

    await tailorJob('job-1');

    expect(mockGenerateTailoredContent).not.toHaveBeenCalled();
  });

  it('marks the job pipeline_stage as error with stage_error populated if every AI provider fails, and rethrows', async () => {
    const jobRow = makeJobRow();
    mockFrom.mockImplementation((table: string) => chainable(table, { data: jobRow, error: null }));
    mockGenerateTailoredContent.mockRejectedValue(new Error('All free-tier models in the 24/7 battery exhausted.'));

    await expect(tailorJob('job-1')).rejects.toThrow('exhausted');

    const errorUpdate = writeCalls.find(
      c => c.table === 'job_applications' && c.op === 'update' && c.payload?.pipeline_stage === 'error'
    );
    expect(errorUpdate).toBeDefined();
    expect(errorUpdate!.payload.stage_error).toContain('exhausted');
  });

  it('marks the job as error (not tailored) if the tailored_documents write itself fails', async () => {
    const jobRow = makeJobRow();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tailored_documents') {
        return chainable(table, { data: null, error: { message: 'constraint violation' } });
      }
      return chainable(table, { data: jobRow, error: null });
    });

    await expect(tailorJob('job-1')).rejects.toThrow('constraint violation');

    const finalStage = writeCalls
      .filter(c => c.table === 'job_applications' && c.op === 'update' && c.payload?.pipeline_stage)
      .pop();
    expect(finalStage?.payload.pipeline_stage).toBe('error');
  });
});
