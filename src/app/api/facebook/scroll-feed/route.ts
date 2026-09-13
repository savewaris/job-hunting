import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getSavedJobs } from '@/domain/jobs';

const execFileAsync = promisify(execFile);

export async function POST(req: Request) {
  try {
    const { url } = await req.json().catch(() => ({ url: '' }));
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'scroll-facebook-jobs.mjs');

    const args = [scriptPath];
    if (url && url.trim()) {
      args.push('--url', url.trim());
    }

    console.log('[API:scroll-facebook-jobs] Launching visible authenticated feed scroller...');
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      timeout: 120000,
    });

    console.log('[API:scroll-facebook-jobs:stdout]', stdout);
    if (stderr) console.warn('[API:scroll-facebook-jobs:stderr]', stderr);

    const updatedJobs = getSavedJobs();
    return NextResponse.json({
      success: true,
      jobs: updatedJobs,
      message: 'Autonomous feed scroll completed!'
    });
  } catch (err: any) {
    console.error('[API:scroll-facebook-jobs:error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to run feed scroller' },
      { status: 500 }
    );
  }
}
