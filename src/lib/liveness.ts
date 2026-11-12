import { isPrivateHost } from '@/lib/renderPage';

const CLOSED_RE = /no longer (available|accepting)|position (has been |is )?filled|(job|posting|role|position) (is |has )?(closed|expired|been removed)|this job (does not exist|is not available)/i;

/**
 * False only when the posting is clearly gone (404/410 or a "closed" message).
 * Network errors, other statuses and private hosts count as live: a flaky check must not drop a real job.
 */
export async function isPostingLive(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || isPrivateHost(u.hostname)) return true;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
    if (res.status === 404 || res.status === 410) return false;
    if (!res.ok) return true;
    return !CLOSED_RE.test((await res.text()).slice(0, 200_000));
  } catch {
    return true;
  }
}
