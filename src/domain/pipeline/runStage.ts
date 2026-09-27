import { getJobById } from '@/domain/jobs';
import { getPipelineSettings } from '@/domain/pipeline/settings';
import { tailorJob, countTailoredToday } from '@/domain/pipeline/tailorJob';

export async function advancePipeline(jobId: string): Promise<void> {
  const job = await getJobById(jobId);
  if (!job || job.pipelineStage !== 'new') return;

  const settings = await getPipelineSettings();
  if (!settings.autoTailor) return;

  const countToday = await countTailoredToday();
  if (countToday >= settings.maxDailyAutoTailor) return;

  try {
    await tailorJob(jobId);
  } catch {
    // tailorJob is responsible for persisting pipeline_stage = 'error' itself
    // (see Task 9) — swallow here so a failed auto-tailor never crashes the
    // caller (e.g. the /api/jobs POST route that just successfully saved the job).
  }
}

export async function runTailorNow(jobId: string): Promise<void> {
  const job = await getJobById(jobId);
  if (!job || (job.pipelineStage !== 'new' && job.pipelineStage !== 'error')) {
    throw new Error(`Job ${jobId} is not in a tailorable state (current stage: ${job?.pipelineStage})`);
  }
  await tailorJob(jobId);
}
