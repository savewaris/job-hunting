import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { ConflictError } from '@/lib/errors';
import { parseJobText } from '@/domain/jobs';
import { createApplication } from '@/domain/applications/repo';
import { fromScrapedJob, listScrapedJobs } from '@/domain/applications/legacy';
import { ScrapedJob } from '@/types/job';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await listScrapedJobs(getDb());
    return ok({ jobs });
  } catch (err) {
    console.error('[jobs:GET]', err);
    return fail('Internal error', 500);
  }
}

export async function POST(req: Request) {
  try {
    let body: { rawText?: string; postUrl?: string };
    try {
      body = await req.json();
    } catch {
      return fail('Invalid JSON body', 400);
    }
    const { rawText, postUrl } = body ?? {};

    if (!rawText && !postUrl) {
      return fail('rawText or postUrl required', 400);
    }

    const parsed = parseJobText(rawText || '', postUrl || 'https://facebook.com');
    const fullJob: ScrapedJob = {
      id: parsed.id || `fb-${Date.now()}`,
      source: 'facebook',
      jobTitle: parsed.jobTitle || 'Full Stack Developer',
      companyName: parsed.companyName || 'Thai Tech Employer',
      jobUrl: postUrl || 'https://facebook.com',
      location: parsed.location || 'Bangkok, Thailand',
      salaryRange: parsed.salaryRange || 'Negotiable (THB)',
      jobDescription: parsed.jobDescription || '',
      requirements: parsed.requirements || ['TypeScript', 'React'],
      contactMethod: parsed.contactMethod,
      rawPostContent: rawText || parsed.jobDescription,
      createdAt: new Date().toISOString(),
    };

    const app = await createApplication(getDb(), fromScrapedJob(fullJob));
    return ok({ job: { ...fullJob, createdAt: app.createdAt } });
  } catch (err) {
    if (err instanceof ConflictError) return fail('Job already saved', 409);
    console.error('[jobs:POST]', err);
    return fail('Internal error', 500);
  }
}
