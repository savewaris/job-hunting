import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getSavedJobs } from '@/domain/jobs';

const execFileAsync = promisify(execFile);

export async function POST(req: Request) {
  try {
    const { url } = await req.json().catch(() => ({ url: '' }));
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'facebook-scraper.mjs');

    const args = [scriptPath];
    if (url && url.trim()) {
      args.push('--url', url.trim());
    }

    console.log('[API:scrape-facebook] Launching visible Playwright scraper...');
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      timeout: 60000,
    });

    console.log('[API:scrape-facebook:stdout]', stdout);
    if (stderr) console.warn('[API:scrape-facebook:stderr]', stderr);

    const updatedJobs = getSavedJobs();
    const latestJob = updatedJobs[0];

    return NextResponse.json({
      success: true,
      job: latestJob,
      allJobs: updatedJobs,
      message: 'Visible Playwright scraper finished successfully'
    });
  } catch (err: any) {
    console.error('[API:scrape-facebook:error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to run visible Playwright scraper' },
      { status: 500 }
    );
  }
}
