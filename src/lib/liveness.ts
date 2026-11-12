import { isPrivateHost } from '@/lib/renderPage';

const CLOSED_RE = /no longer (available|accepting)|position (has been |is )?filled|(job|posting|role|position) (is |has )?(closed|expired|been removed)|this job (does not exist|is not available)/i;

/**
 * False only when the posting is clearly gone (404/410 or a "closed" message).
 * Network errors, other statuses and private hosts count as live: a flaky check must not drop a real job.
 */
export async function isPostingLive(url: string): Promise<boolean> {
  try {
    // Redirects are followed by hand so every hop is re-checked against the private-host guard.
    // shortcut: host names are checked, not resolved, so DNS rebinding is not caught; resolve and pin the IP if URLs ever come from untrusted users.
    let target = url;
    for (let hop = 0; hop < 4; hop++) {
      const u = new URL(target);
      if ((u.protocol !== 'http:' && u.protocol !== 'https:') || isPrivateHost(u.hostname)) return true;
      const res = await fetch(target, { signal: AbortSignal.timeout(8000), redirect: 'manual' });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return true;
        target = new URL(location, u).toString();
        continue;
      }
      if (res.status === 404 || res.status === 410) return false;
      if (!res.ok) return true;
      return !CLOSED_RE.test((await res.text()).slice(0, 200_000));
    }
    return true;
  } catch {
    return true;
  }
}
