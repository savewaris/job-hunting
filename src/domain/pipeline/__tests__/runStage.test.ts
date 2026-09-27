import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetJobById = vi.fn();
const mockGetPipelineSettings = vi.fn();
const mockCountTailoredToday = vi.fn();
const mockTailorJob = vi.fn();
const mockMarkStageError = vi.fn();

vi.mock('@/domain/jobs', () => ({
  getJobById: (...args: any[]) => mockGetJobById(...args),
}));
vi.mock('@/domain/pipeline/settings', () => ({
  getPipelineSettings: (...args: any[]) => mockGetPipelineSettings(...args),
}));
vi.mock('@/domain/pipeline/tailorJob', () => ({
  tailorJob: (...args: any[]) => mockTailorJob(...args),
  countTailoredToday: (...args: any[]) => mockCountTailoredToday(...args),
}));

import { advancePipeline, runTailorNow } from '../runStage';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('advancePipeline', () => {
  it('does nothing when the job is not at "new"', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'tailored' });
    await advancePipeline('job-1');
    expect(mockTailorJob).not.toHaveBeenCalled();
  });

  it('does not tailor when auto_tailor is off', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'new' });
    mockGetPipelineSettings.mockResolvedValue({ autoTailor: false, maxDailyAutoTailor: 20 });

    await advancePipeline('job-1');

    expect(mockTailorJob).not.toHaveBeenCalled();
  });

  it('tailors when auto_tailor is on and under the daily cap', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'new' });
    mockGetPipelineSettings.mockResolvedValue({ autoTailor: true, maxDailyAutoTailor: 20 });
    mockCountTailoredToday.mockResolvedValue(5);

    await advancePipeline('job-1');

    expect(mockTailorJob).toHaveBeenCalledWith('job-1');
  });

  it('does not tailor once the daily cap is reached', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'new' });
    mockGetPipelineSettings.mockResolvedValue({ autoTailor: true, maxDailyAutoTailor: 20 });
    mockCountTailoredToday.mockResolvedValue(20);

    await advancePipeline('job-1');

    expect(mockTailorJob).not.toHaveBeenCalled();
  });

  it('does not throw if tailorJob rejects — tailorJob itself owns error-state persistence', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'new' });
    mockGetPipelineSettings.mockResolvedValue({ autoTailor: true, maxDailyAutoTailor: 20 });
    mockCountTailoredToday.mockResolvedValue(0);
    mockTailorJob.mockRejectedValue(new Error('all providers failed'));

    await expect(advancePipeline('job-1')).resolves.not.toThrow();
  });
});

describe('runTailorNow', () => {
  it('allows retrying a job stuck at "error"', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'error' });

    await runTailorNow('job-1');

    expect(mockTailorJob).toHaveBeenCalledWith('job-1');
  });

  it('allows a first attempt on a job at "new"', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'new' });

    await runTailorNow('job-1');

    expect(mockTailorJob).toHaveBeenCalledWith('job-1');
  });

  it('rejects a job already tailored, tailoring, or sent', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'tailoring' });

    await expect(runTailorNow('job-1')).rejects.toThrow('not in a tailorable state');
    expect(mockTailorJob).not.toHaveBeenCalled();
  });
});
