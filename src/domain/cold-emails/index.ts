import { getSupabaseClient } from '@/lib/supabase';

export interface ColdEmail {
  id: string;
  jobApplicationId: string;
  companyName: string;
  jobTitle: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: 'draft' | 'reviewed' | 'sent';
  tailoredSummary: string | null;
}

function rowToEmail(row: any): ColdEmail {
  return {
    id: row.id,
    jobApplicationId: row.job_application_id,
    companyName: row.company_name,
    jobTitle: row.job_title,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    body: row.body,
    status: row.status,
    tailoredSummary: row.tailored_summary,
  };
}

export async function getDraftColdEmails(): Promise<ColdEmail[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('cold_emails')
    .select('*')
    .neq('status', 'sent')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[COLD_EMAIL_ERROR:list] ${error.message}`);
  return (data ?? []).map(rowToEmail);
}

export async function getColdEmailById(id: string): Promise<ColdEmail | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('cold_emails').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`[COLD_EMAIL_ERROR:get] ${error.message}`);
  return data ? rowToEmail(data) : null;
}

export async function updateColdEmail(id: string, patch: { subject?: string; body?: string; status?: ColdEmail['status'] }): Promise<ColdEmail> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('cold_emails').update(patch).eq('id', id).select().single();
  if (error) throw new Error(`[COLD_EMAIL_ERROR:update] ${error.message}`);
  return rowToEmail(data);
}
