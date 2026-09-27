import { createHash } from 'crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { ScrapedJob, PipelineStage } from '@/types/job';

const TABLE = 'job_applications';

export function computeExternalId(rawText: string): string {
  return createHash('sha256').update(rawText.trim()).digest('hex');
}

function rowToJob(row: any): ScrapedJob {
  return {
    id: row.id,
    source: row.source ?? 'manual',
    jobTitle: row.job_title,
    companyName: row.company_name,
    jobUrl: row.job_url ?? '',
    location: row.location ?? '',
    salaryRange: row.salary_range ?? undefined,
    jobDescription: row.job_description ?? '',
    requirements: row.requirements ?? [],
    contactMethod: row.contact_method_type
      ? { type: row.contact_method_type, value: row.contact_method_value }
      : undefined,
    rawPostContent: row.raw_post_content ?? undefined,
    author: row.author ?? undefined,
    matchScore: row.match_score ?? undefined,
    createdAt: row.created_at,
    pipelineStage: row.pipeline_stage as PipelineStage,
    stageError: row.stage_error,
    externalId: row.external_id,
  };
}

export async function getAllJobs(): Promise<ScrapedJob[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[JOBS_ERROR:list] ${error.message}`);
  return (data ?? []).map(rowToJob);
}

export async function getJobById(id: string): Promise<ScrapedJob | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();

  if (error) throw new Error(`[JOBS_ERROR:get] ${error.message}`);
  return data ? rowToJob(data) : null;
}

/**
 * Intelligent parser for Thai & English tech job posts (e.g. from Facebook Groups)
 * Extracts: Title, Company, Salary (THB), Tech Stack, HR Email, LINE ID, Form Link
 */
export function parseJobText(rawText: string, postUrl: string = ''): Partial<ScrapedJob> {
  const text = rawText.trim();

  const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
  const email = emailMatch ? emailMatch[1] : undefined;

  const lineMatch = text.match(/(?:line(?:\s*id)?|line:)\s*[:@]?\s*([a-zA-Z0-9._@-]+)/i);
  const lineId = lineMatch ? lineMatch[1] : undefined;

  const salaryMatch = text.match(/(?:salary|เงินเดือน|งบ|ค่าตอบแทน)?\s*[:]?\s*(?:฿|thb)?\s*(\d{1,3}(?:,\d{3})*(?:\s*-\s*\d{1,3}(?:,\d{3})*)?\s*(?:thb|บาท|k|\/month|\/เดือน)?)/i);
  let salaryRange: string | undefined;
  if (salaryMatch && salaryMatch[1] && salaryMatch[1].length > 3) {
    salaryRange = salaryMatch[1].trim();
    if (!salaryRange.toLowerCase().includes('บาท') && !salaryRange.toLowerCase().includes('thb')) {
      salaryRange = `฿${salaryRange}`;
    }
  }

  const techKeywords = [
    'React', 'Next.js', 'Nextjs', 'Vue', 'Angular', 'TypeScript', 'JavaScript', 'Node.js', 'Nodejs',
    'Express', 'NestJS', 'Nest.js', 'Python', 'FastAPI', 'Django', 'Golang', 'Go', 'PHP', 'Laravel',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Tailwind',
    'Flutter', 'React Native', 'Swift', 'Kotlin', 'Git', 'Prisma', 'GraphQL',
  ];
  const matchedStack: string[] = [];
  techKeywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');
    if (regex.test(text)) matchedStack.push(kw);
  });

  let jobTitle = 'Software Engineer';
  const titlePatterns = [
    /(?:position|ตำแหน่ง|รับสมัคร|หาคนทำ|looking for)?\s*[:]?\s*([A-Za-z0-9\s/]+(?:Developer|Engineer|Programmer|Frontend|Backend|Full\s*Stack|Data\s*Analyst|DevOps|QA))/i,
    /(Full\s*Stack\s*Developer|Frontend\s*Developer|Backend\s*Developer|Software\s*Engineer|React\s*Developer|Node\.js\s*Developer)/i,
  ];
  for (const pat of titlePatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      jobTitle = m[1].replace(/^(position|ตำแหน่ง|รับสมัคร|looking for)\s*[:]?/i, '').trim();
      break;
    }
  }

  let companyName = 'Thai Tech Employer';
  const companyMatch = text.match(/(?:company|บริษัท|บ\.)\s*[:]?\s*([^\n,]+)/i);
  if (companyMatch && companyMatch[1]) companyName = companyMatch[1].trim();

  let contactMethod: ScrapedJob['contactMethod'] = undefined;
  if (email) contactMethod = { type: 'email', value: email };
  else if (lineId) contactMethod = { type: 'line', value: lineId };
  else if (postUrl) contactMethod = { type: 'portal', value: postUrl };

  return {
    source: 'facebook',
    jobTitle,
    companyName,
    jobUrl: postUrl || 'https://facebook.com',
    location: text.toLowerCase().includes('remote') || text.includes('wfh') ? 'Bangkok, Thailand (Hybrid/Remote)' : 'Bangkok, Thailand',
    salaryRange: salaryRange || 'Negotiable (THB)',
    jobDescription: text.slice(0, 1500),
    requirements: matchedStack.length > 0 ? Array.from(new Set(matchedStack)) : ['TypeScript', 'React', 'Node.js'],
    contactMethod,
    rawPostContent: text,
  };
}

export async function createJobFromFacebookPaste(rawText: string, postUrl: string): Promise<ScrapedJob> {
  const supabase = getSupabaseClient();
  const externalId = computeExternalId(rawText);

  const existing = await supabase.from(TABLE).select('*').eq('external_id', externalId).maybeSingle();
  if (existing.data) return rowToJob(existing.data);

  const parsed = parseJobText(rawText, postUrl);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      source: 'facebook',
      job_title: parsed.jobTitle,
      company_name: parsed.companyName,
      job_url: parsed.jobUrl,
      location: parsed.location,
      salary_range: parsed.salaryRange,
      job_description: parsed.jobDescription,
      requirements: parsed.requirements,
      contact_method_type: parsed.contactMethod?.type ?? null,
      contact_method_value: parsed.contactMethod?.value ?? null,
      raw_post_content: parsed.rawPostContent,
      external_id: externalId,
      pipeline_stage: 'new',
    })
    .select()
    .single();

  if (error) throw new Error(`[JOBS_ERROR:create] ${error.message}`);
  return rowToJob(data);
}
