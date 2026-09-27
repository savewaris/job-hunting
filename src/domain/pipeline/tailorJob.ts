import { getSupabaseClient } from '@/lib/supabase';
import { generateTailoredContent } from '@/lib/ai-tailor-client';
import { getMasterProfile, getScreeningDefaults } from '@/domain/profile';

export async function countTailoredToday(): Promise<number> {
  const supabase = getSupabaseClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('job_applications')
    .select('id', { count: 'exact', head: true })
    .gte('tailored_at', startOfDay.toISOString());

  if (error) throw new Error(`[TAILOR_ERROR:count] ${error.message}`);
  return count ?? 0;
}

function buildPrompt(job: any): string {
  const profile = getMasterProfile();
  const screening = getScreeningDefaults();

  return `You are tailoring a job application for this candidate:
Skills: ${profile.skills.join(', ')}
Work authorization: ${screening.workAuthorization}
Notice period: ${screening.noticePeriod}

Job: ${job.job_title} at ${job.company_name}
Description: ${job.job_description}
Requirements: ${(job.requirements ?? []).join(', ')}

Write two things, clearly separated by "---COVER LETTER---":
1. A short list of 3-5 tailored resume bullet points highlighting the candidate's most relevant experience for this specific job.
2. A concise, personalized cold-email cover letter (150-200 words) for this specific job.`;
}

export async function tailorJob(jobId: string): Promise<void> {
  const supabase = getSupabaseClient();

  await supabase
    .from('job_applications')
    .update({ pipeline_stage: 'tailoring', tailored_at: new Date().toISOString() })
    .eq('id', jobId);

  const { data: job, error: fetchError } = await supabase
    .from('job_applications')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !job) {
    throw new Error(`[TAILOR_ERROR:fetch] ${fetchError?.message ?? 'job not found'}`);
  }

  try {
    const content = await generateTailoredContent(buildPrompt(job));
    const [bullets, coverLetter] = content.split('---COVER LETTER---').map(s => s.trim());

    await supabase.from('tailored_documents').insert({
      job_application_id: jobId,
      doc_type: 'resume',
      content: bullets || content,
    });

    if (job.contact_method_type === 'email' && job.contact_method_value) {
      await supabase.from('cold_emails').insert({
        job_application_id: jobId,
        company_name: job.company_name,
        job_title: job.job_title,
        recipient_email: job.contact_method_value,
        subject: `Application: ${job.job_title} at ${job.company_name}`,
        body: coverLetter || content,
        status: 'draft',
        tailored_summary: bullets || content,
      });
    }

    await supabase.from('job_applications').update({ pipeline_stage: 'tailored' }).eq('id', jobId);
  } catch (err: any) {
    await supabase
      .from('job_applications')
      .update({ pipeline_stage: 'error', stage_error: err.message })
      .eq('id', jobId);
    throw err;
  }
}
