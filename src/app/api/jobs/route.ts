import { NextResponse } from 'next/server';
import { getSavedJobs, saveJob, parseJobText } from '@/domain/jobs';
import { ScrapedJob } from '@/types/job';

export async function GET() {
  try {
    const jobs = getSavedJobs();
    return NextResponse.json({ success: true, jobs });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rawText, postUrl } = body;

    if (!rawText && !postUrl) {
      return NextResponse.json({ success: false, error: 'rawText or postUrl required' }, { status: 400 });
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

    saveJob(fullJob);
    return NextResponse.json({ success: true, job: fullJob });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
