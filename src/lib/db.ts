import { supabase, isSupabaseConfigured } from './supabase';
import { 
  JobApplication, 
  MasterProfile, 
  Interview, 
  JobOffer, 
  ColdEmail,
  JobStatus 
} from '@/types';
import { 
  INITIAL_APPLICATIONS, 
  MOCK_MASTER_PROFILE, 
  MOCK_INTERVIEWS, 
  MOCK_OFFERS,
  INITIAL_COLD_EMAILS
} from './mockData';

// ==========================================
// DB Snake <-> Camel Mappings
// ==========================================

export function mapDbToApplication(row: any): JobApplication {
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    jobTitle: row.job_title,
    jobUrl: row.job_url || undefined,
    location: row.location || undefined,
    jobType: row.job_type || 'Full-time',
    salaryRange: row.salary_range || undefined,
    status: (row.status as JobStatus) || 'wishlist',
    matchScore: typeof row.match_score === 'number' ? row.match_score : 80,
    jobDescription: row.job_description || undefined,
    requirements: Array.isArray(row.requirements) ? row.requirements : [],
    appliedDate: row.applied_date || undefined,
    deadlineDate: row.deadline_date || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapApplicationToDb(app: Partial<JobApplication>): any {
  const row: any = {};
  if (app.id) row.id = app.id;
  if (app.userId) row.user_id = app.userId;
  if (app.companyName) row.company_name = app.companyName;
  if (app.jobTitle) row.job_title = app.jobTitle;
  if (app.jobUrl !== undefined) row.job_url = app.jobUrl;
  if (app.location !== undefined) row.location = app.location;
  if (app.jobType) row.job_type = app.jobType;
  if (app.salaryRange !== undefined) row.salary_range = app.salaryRange;
  if (app.status) row.status = app.status;
  if (typeof app.matchScore === 'number') row.match_score = app.matchScore;
  if (app.jobDescription !== undefined) row.job_description = app.jobDescription;
  if (app.requirements !== undefined) row.requirements = app.requirements;
  if (app.appliedDate !== undefined) row.applied_date = app.appliedDate;
  if (app.deadlineDate !== undefined) row.deadline_date = app.deadlineDate;
  if (app.notes !== undefined) row.notes = app.notes;
  return row;
}

// ==========================================
// Job Applications Queries
// ==========================================

export async function fetchJobApplications(): Promise<JobApplication[]> {
  if (!isSupabaseConfigured()) {
    return INITIAL_APPLICATIONS;
  }

  try {
    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      console.warn('Supabase query returned empty or error, falling back to initial data:', error?.message);
      return INITIAL_APPLICATIONS;
    }

    return data.map(mapDbToApplication);
  } catch (err) {
    console.error('Failed to fetch job applications from Supabase:', err);
    return INITIAL_APPLICATIONS;
  }
}

export async function createJobApplication(
  app: Omit<JobApplication, 'id' | 'createdAt'>
): Promise<JobApplication> {
  const id = `app-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const newApp: JobApplication = {
    ...app,
    id,
    createdAt,
  };

  if (isSupabaseConfigured()) {
    try {
      const dbRow = mapApplicationToDb(newApp);
      const { data, error } = await supabase
        .from('job_applications')
        .insert([dbRow])
        .select()
        .single();

      if (!error && data) {
        return mapDbToApplication(data);
      } else {
        console.warn('Supabase insert failed, returning local application:', error?.message);
      }
    } catch (err) {
      console.error('Error inserting job application to Supabase:', err);
    }
  }

  return newApp;
}

export async function updateJobApplicationStatus(
  id: string,
  status: JobStatus
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return true;
  }

  try {
    const { error } = await supabase
      .from('job_applications')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.warn('Supabase update status failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error updating application in Supabase:', err);
    return false;
  }
}

export async function deleteJobApplicationFromDb(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return true;
  }

  try {
    const { error } = await supabase
      .from('job_applications')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn('Supabase delete failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error deleting application in Supabase:', err);
    return false;
  }
}

// ==========================================
// Master Profile Queries (writes to master_profiles)
// ==========================================

export async function fetchMasterProfile(): Promise<MasterProfile> {
  if (!isSupabaseConfigured()) {
    // Mirror the localStorage fallback that saveMasterProfileToDb writes to when
    // Supabase isn't configured — without this, saved edits were silently discarded
    // on every reload since nothing ever read them back.
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('careerpulse_master_profile');
        if (stored) {
          return { ...MOCK_MASTER_PROFILE, ...JSON.parse(stored) };
        }
      } catch (e) {
        console.warn('Failed to read cached master profile from localStorage:', e);
      }
    }
    return MOCK_MASTER_PROFILE;
  }

  try {
    const { data, error } = await supabase
      .from('master_profiles')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return MOCK_MASTER_PROFILE;
    }

    return {
      id: data.id,
      userId: data.user_id,
      fullName: data.full_name || MOCK_MASTER_PROFILE.fullName,
      email: data.email || MOCK_MASTER_PROFILE.email,
      targetTitle: data.target_title || MOCK_MASTER_PROFILE.targetTitle,
      summary: data.summary || '',
      skills: Array.isArray(data.skills) ? data.skills : [],
      experiences: Array.isArray(data.experiences) ? data.experiences : [],
      education: Array.isArray(data.education) ? data.education : [],
      projects: Array.isArray(data.projects) ? data.projects : [],
    };
  } catch (err) {
    console.error('Error fetching master profile from Supabase:', err);
    return MOCK_MASTER_PROFILE;
  }
}

export async function saveMasterProfileToDb(profile: MasterProfile): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('careerpulse_master_profile', JSON.stringify(profile));
      } catch (e) {}
    }
    return true;
  }

  try {
    const payload = {
      full_name: profile.fullName,
      email: profile.email,
      target_title: profile.targetTitle,
      summary: profile.summary,
      skills: profile.skills,
      experiences: profile.experiences,
      education: profile.education,
      projects: profile.projects,
      updated_at: new Date().toISOString(),
    };

    if (profile.id) {
      const { error } = await supabase
        .from('master_profiles')
        .upsert({ id: profile.id, ...payload });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('master_profiles')
        .insert([payload]);
      if (error) throw error;
    }

    return true;
  } catch (err) {
    console.error('Error saving master profile to Supabase:', err);
    return false;
  }
}

// ==========================================
// Interviews & Offers Queries
// ==========================================

export async function fetchInterviews(): Promise<Interview[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_INTERVIEWS;
  }

  try {
    const { data, error } = await supabase
      .from('interviews')
      .select('*, job_applications(company_name, job_title)')
      .order('scheduled_at', { ascending: true });

    if (error || !data || data.length === 0) {
      return MOCK_INTERVIEWS;
    }

    return data.map((row: any) => ({
      id: row.id,
      jobApplicationId: row.job_application_id,
      companyName: row.job_applications?.company_name || 'Company',
      jobTitle: row.job_applications?.job_title || 'Role',
      roundName: row.round_name,
      scheduledAt: row.scheduled_at,
      interviewerNames: row.interviewer_names,
      prepNotes: row.prep_notes,
      feedback: row.feedback,
      status: row.status || 'scheduled',
    }));
  } catch (err) {
    console.error('Error fetching interviews:', err);
    return MOCK_INTERVIEWS;
  }
}

export async function fetchOffers(): Promise<JobOffer[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_OFFERS;
  }

  try {
    const { data, error } = await supabase
      .from('offers')
      .select('*, job_applications(company_name, job_title)')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return MOCK_OFFERS;
    }

    return data.map((row: any) => ({
      id: row.id,
      jobApplicationId: row.job_application_id,
      companyName: row.job_applications?.company_name || 'Company',
      jobTitle: row.job_applications?.job_title || 'Role',
      baseSalary: row.base_salary,
      signingBonus: row.signing_bonus || 0,
      annualBonusPercent: Number(row.annual_bonus_percent) || 0,
      equityValue: row.equity_value || 0,
      benefitsScore: row.benefits_score || 5,
      remoteFlexibility: row.remote_flexibility || 'Hybrid',
      deadline: row.deadline,
      status: row.status || 'pending',
    }));
  } catch (err) {
    console.error('Error fetching offers:', err);
    return MOCK_OFFERS;
  }
}

// ==========================================
// Cold Email Queue Queries
// ==========================================

export async function fetchColdEmails(): Promise<ColdEmail[]> {
  if (!isSupabaseConfigured()) {
    return INITIAL_COLD_EMAILS;
  }

  try {
    const { data, error } = await supabase
      .from('cold_emails')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return INITIAL_COLD_EMAILS;
    }

    return data.map((row: any) => ({
      id: row.id,
      jobApplicationId: row.job_application_id,
      companyName: row.company_name,
      jobTitle: row.job_title,
      recipientName: row.recipient_name,
      recipientRole: row.recipient_role,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      body: row.body,
      status: row.status || 'draft',
      sentAt: row.sent_at,
      createdAt: row.created_at,
      tailoredSummary: row.tailored_summary,
      suggestedBullets: row.suggested_bullets,
    }));
  } catch (err) {
    console.error('Error fetching cold emails:', err);
    return INITIAL_COLD_EMAILS;
  }
}

export async function saveColdEmailToDb(email: ColdEmail): Promise<ColdEmail> {
  if (!isSupabaseConfigured()) {
    return email;
  }

  try {
    const payload = {
      job_application_id: email.jobApplicationId || null,
      company_name: email.companyName,
      job_title: email.jobTitle,
      recipient_name: email.recipientName,
      recipient_role: email.recipientRole,
      recipient_email: email.recipientEmail,
      subject: email.subject,
      body: email.body,
      status: email.status,
      sent_at: email.sentAt || null,
      tailored_summary: email.tailoredSummary || null,
      suggested_bullets: email.suggestedBullets || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('cold_emails')
      .upsert({ id: email.id, ...payload })
      .select()
      .maybeSingle();

    if (!error && data) {
      return {
        ...email,
        id: data.id,
      };
    }
  } catch (err) {
    console.error('Error saving cold email to Supabase:', err);
  }

  return email;
}

export async function deleteColdEmailFromDb(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return true;
  }

  try {
    const { error } = await supabase
      .from('cold_emails')
      .delete()
      .eq('id', id);

    return !error;
  } catch (err) {
    console.error('Error deleting cold email from Supabase:', err);
    return false;
  }
}
