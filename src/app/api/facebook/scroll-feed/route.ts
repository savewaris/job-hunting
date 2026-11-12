import { NextResponse } from 'next/server';
import { getDb } from '@/lib/sql';
import { fail } from '@/lib/http';
import { tryLockScrape } from '@/lib/scrapeLock';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { listScrapedJobs, syncLegacyJobs } from '@/domain/applications/legacy';

const execFileAsync = promisify(execFile);

export async function POST(req: Request) {
  const release = tryLockScrape();
  if (!release) return fail('A Facebook scrape is already running', 409);
  try {
    const { url } = await req.json().catch(() => ({ url: '' }));
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'scroll-facebook-jobs.mjs');

    const args = [scriptPath];
    if (typeof url === 'string' && url.trim()) {
      args.push('--url', url.trim());
    }

    console.log('[API:scroll-facebook-jobs] Launching visible authenticated feed scroller...');
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      timeout: 120000,
    });

    console.log('[API:scroll-facebook-jobs:stdout]', stdout);
    if (stderr) console.warn('[API:scroll-facebook-jobs:stderr]', stderr);

    await syncLegacyJobs(getDb());
    const updatedJobs = await listScrapedJobs(getDb());
    return NextResponse.json({
      success: true,
      jobs: updatedJobs,
      message: 'Autonomous feed scroll completed!'
    });
  } catch (err) {
    console.error('[API:scroll-facebook-jobs:error]', err);
    return fail('Internal error', 500);
  } finally {
    release();
  }
}
