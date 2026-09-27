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

  const experienceLines = profile.experiences
    .map((exp) => `- ${exp.role} at ${exp.company}: ${exp.description}`)
    .join('\n') || '(none on file)';

  return `You are tailoring a job application for this candidate:
Name: ${profile.fullName}
Summary: ${profile.summary}
Skills: ${profile.skills.join(', ')}
Experience:
${experienceLines}
Work authorization: ${screening.workAuthorization}
Notice period: ${screening.noticePeriod}

Job: ${job.job_title} at ${job.company_name}
Description: ${job.job_description}
Requirements: ${(job.requirements ?? []).join(', ')}

Write two things, clearly separated by "---COVER LETTER---":
1. A short list of 3-5 tailored resume bullet points highlighting the candidate's most relevant real experience and skills (listed above) for this specific job. Only use facts given above — never invent employers, titles, or credentials.
2. A concise, personalized cold-email cover letter (150-200 words) for this specific job, signed with the candidate's real name above instead of a placeholder.`;
}

export async function tailorJob(jobId: string): Promise<void> {
  const supabase = getSupabaseClient();

  // Atomically claim the job: only a job still at 'new' (first attempt) or
  // 'error' (manual retry) is claimed, and .select().maybeSingle() returning
  // nothing means someone/something else already claimed or finished it —
  // in that case there is nothing to do. This also means a job stuck at
  // 'tailoring' from a crashed prior attempt can't silently succeed twice.
  const { data: claimed, error: claimError } = await supabase
    .from('job_applications')
    .update({ pipeline_stage: 'tailoring', tailored_at: new Date().toISOString(), stage_error: null })
    .eq('id', jobId)
    .in('pipeline_stage', ['new', 'error'])
    .select()
    .maybeSingle();

  if (claimError) {
    throw new Error(`[TAILOR_ERROR:claim] ${claimError.message}`);
  }
  if (!claimed) {
    return;
  }

  const job = claimed;

  try {
    const content = await generateTailoredContent(buildPrompt(job));
    const [bullets, coverLetter] = content.split('---COVER LETTER---').map(s => s.trim());

    const { error: docError } = await supabase.from('tailored_documents').insert({
      job_application_id: jobId,
      doc_type: 'resume',
      content: bullets || content,
    });
    if (docError) throw new Error(`[TAILOR_ERROR:doc] ${docError.message}`);

    if (job.contact_method_type === 'email' && job.contact_method_value) {
      const { error: emailError } = await supabase.from('cold_emails').insert({
        job_application_id: jobId,
        company_name: job.company_name,
        job_title: job.job_title,
        recipient_email: job.contact_method_value,
        subject: `Application: ${job.job_title} at ${job.company_name}`,
        body: coverLetter || content,
        status: 'draft',
        tailored_summary: bullets || content,
      });
      if (emailError) throw new Error(`[TAILOR_ERROR:coldEmail] ${emailError.message}`);
    }

    const { error: finalizeError } = await supabase
      .from('job_applications')
      .update({ pipeline_stage: 'tailored' })
      .eq('id', jobId);
    if (finalizeError) throw new Error(`[TAILOR_ERROR:finalize] ${finalizeError.message}`);
  } catch (err: any) {
    await supabase
      .from('job_applications')
      .update({ pipeline_stage: 'error', stage_error: err.message })
      .eq('id', jobId);
    throw err;
  }
}
