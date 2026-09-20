import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getSavedJobs } from '@/domain/jobs';

const execFileAsync = promisify(execFile);

// This route spawns a real, visible Playwright browser subprocess on the
// server, so it needs two guardrails even without a full auth system:
// same-origin (this app has no session/auth to check instead, so Origin is
// the cheapest real CSRF defense for a state-changing POST) and an allowlist
// on the target URL (it's handed straight to the subprocess and navigated
// to by Playwright, so an arbitrary URL here is an SSRF vector).
const ALLOWED_URL_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com'];

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin requests (e.g. curl/dev tools) omit Origin
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

function isAllowedFacebookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return ALLOWED_URL_HOSTS.includes(parsed.hostname.toLowerCase()) && parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ success: false, error: 'Cross-origin requests are not allowed' }, { status: 403 });
  }

  try {
    const { url } = await req.json().catch(() => ({ url: '' }));
    const trimmedUrl = typeof url === 'string' ? url.trim() : '';

    if (trimmedUrl && !isAllowedFacebookUrl(trimmedUrl)) {
      return NextResponse.json(
        { success: false, error: 'Only facebook.com post URLs are allowed' },
        { status: 400 }
      );
    }

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'facebook-scraper.mjs');

    const args = [scriptPath];
    if (trimmedUrl) {
      args.push('--url', trimmedUrl);
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
