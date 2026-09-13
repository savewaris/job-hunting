import fs from 'fs';
import path from 'path';
import { ScrapedJob } from '@/types/job';

const jobsFilePath = path.resolve(process.cwd(), 'src', 'domain', 'jobs', 'jobs.json');

export function getSavedJobs(): ScrapedJob[] {
  try {
    if (!fs.existsSync(jobsFilePath)) return [];
    const content = fs.readFileSync(jobsFilePath, 'utf-8');
    return JSON.parse(content) as ScrapedJob[];
  } catch (err) {
    console.error('[JOBS_ERROR:read]', err);
    return [];
  }
}

export function saveJob(newJob: ScrapedJob): ScrapedJob[] {
  const jobs = getSavedJobs();
  const existingIdx = jobs.findIndex(j => j.id === newJob.id || (j.jobUrl && j.jobUrl === newJob.jobUrl));
  
  if (existingIdx >= 0) {
    jobs[existingIdx] = { ...jobs[existingIdx], ...newJob };
  } else {
    jobs.unshift(newJob);
  }

  try {
    fs.writeFileSync(jobsFilePath, JSON.stringify(jobs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[JOBS_ERROR:write]', err);
  }

  return jobs;
}

/**
 * Intelligent parser for Thai & English tech job posts (e.g. from Facebook Groups)
 * Extracts: Title, Company, Salary (THB), Tech Stack, HR Email, LINE ID, Form Link
 */
export function parseJobText(rawText: string, postUrl: string = ''): Partial<ScrapedJob> {
  const text = rawText.trim();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Extract Emails
  const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
  const email = emailMatch ? emailMatch[1] : undefined;

  // 2. Extract LINE ID
  const lineMatch = text.match(/(?:line(?:\s*id)?|line:)\s*[:@]?\s*([a-zA-Z0-9._@-]+)/i);
  const lineId = lineMatch ? lineMatch[1] : undefined;

  // 3. Extract Salary (e.g. 35,000 - 50,000 THB, 30k - 50k, 40,000+)
  const salaryMatch = text.match(/(?:salary|เงินเดือน|งบ|ค่าตอบแทน)?\s*[:]?\s*(?:฿|thb)?\s*(\d{1,3}(?:,\d{3})*(?:\s*-\s*\d{1,3}(?:,\d{3})*)?\s*(?:thb|บาท|k|\/month|\/เดือน)?)/i);
  let salaryRange: string | undefined;
  if (salaryMatch && salaryMatch[1] && salaryMatch[1].length > 3) {
    salaryRange = salaryMatch[1].trim();
    if (!salaryRange.toLowerCase().includes('บาท') && !salaryRange.toLowerCase().includes('thb')) {
      salaryRange = `฿${salaryRange}`;
    }
  }

  // 4. Extract Tech Stack Keywords
  const techKeywords = [
    'React', 'Next.js', 'Nextjs', 'Vue', 'Angular', 'TypeScript', 'JavaScript', 'Node.js', 'Nodejs',
    'Express', 'NestJS', 'Nest.js', 'Python', 'FastAPI', 'Django', 'Golang', 'Go', 'PHP', 'Laravel',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Tailwind',
    'Flutter', 'React Native', 'Swift', 'Kotlin', 'Git', 'Prisma', 'GraphQL'
  ];
  const matchedStack: string[] = [];
  techKeywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');
    if (regex.test(text)) {
      matchedStack.push(kw);
    }
  });

  // 5. Deduce Job Title
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

  // 6. Deduce Company Name
  let companyName = 'Thai Tech Employer';
  const companyMatch = text.match(/(?:company|บริษัท|บ\.)\s*[:]?\s*([^\n,]+)/i);
  if (companyMatch && companyMatch[1]) {
    companyName = companyMatch[1].trim();
  }

  // 7. Deduce Contact Method
  let contactMethod: ScrapedJob['contactMethod'] = undefined;
  if (email) {
    contactMethod = { type: 'email', value: email };
  } else if (lineId) {
    contactMethod = { type: 'line', value: lineId };
  } else if (postUrl) {
    contactMethod = { type: 'portal', value: postUrl };
  }

  return {
    id: `fb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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
    createdAt: new Date().toISOString(),
  };
}
