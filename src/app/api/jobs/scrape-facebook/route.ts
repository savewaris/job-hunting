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
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'facebook-scraper.mjs');

    const args = [scriptPath];
    if (typeof url === 'string' && url.trim()) {
      args.push('--url', url.trim());
    }

    console.log('[API:scrape-facebook] Launching visible Playwright scraper...');
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      timeout: 60000,
    });

    console.log('[API:scrape-facebook:stdout]', stdout);
    if (stderr) console.warn('[API:scrape-facebook:stderr]', stderr);

    await syncLegacyJobs(getDb());
    const updatedJobs = await listScrapedJobs(getDb());
    const latestJob = updatedJobs[0];

    return NextResponse.json({
      success: true,
      job: latestJob,
      allJobs: updatedJobs,
      message: 'Visible Playwright scraper finished successfully'
    });
  } catch (err) {
    console.error('[API:scrape-facebook:error]', err);
    return fail('Internal error', 500);
  } finally {
    release();
  }
}
