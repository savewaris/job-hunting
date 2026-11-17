import { isPrivateHost } from '@/lib/renderPage';

const MAX_REDIRECTS = 4;

/**
 * fetch() for URLs that came from scraped third-party content: http(s) only, never a private or
 * internal host, and redirects are followed by hand so every hop is re-checked. Throws on a blocked
 * URL or too many redirects.
 * shortcut: host names are checked, not resolved, so DNS rebinding is not caught; resolve and pin the IP if this ever fetches URLs from untrusted users.
 */
export async function fetchPublicPage(url: string, init: RequestInit = {}): Promise<Response> {
  let target = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(target);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || isPrivateHost(u.hostname)) {
      throw new Error(`Blocked: ${u.protocol}//${u.hostname} is not a public web address`);
    }
    const res = await fetch(target, { ...init, redirect: 'manual' });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    target = new URL(location, u).toString();
  }
  throw new Error('Too many redirects');
}
