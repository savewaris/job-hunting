import { NextResponse } from 'next/server';
import { getAllJobs, createJobFromFacebookPaste } from '@/domain/jobs';
import { advancePipeline } from '@/domain/pipeline/runStage';

export async function GET() {
  try {
    const jobs = await getAllJobs();
    return NextResponse.json({ success: true, jobs });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rawText, postUrl } = body;

    if (!rawText) {
      return NextResponse.json({ success: false, error: 'rawText is required' }, { status: 400 });
    }

    const job = await createJobFromFacebookPaste(rawText, postUrl || 'https://facebook.com');
    await advancePipeline(job.id);

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
