// Edge-runtime safe: no Node APIs, no imports.
const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function extractHostname(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith('[')) {
    // Bracketed value: only an IPv6 literal is acceptable, e.g. "[::1]:3000" -> "::1".
    const end = host.indexOf(']');
    if (end === -1) return '';
    const rest = host.slice(end + 1);
    if (rest !== '' && !/^:\d+$/.test(rest)) return '';
    const inner = host.slice(1, end);
    if (!inner.includes(':') || !/^[0-9a-f:.]+$/.test(inner)) return '';
    return inner;
  }
  const colonCount = host.split(':').length - 1;
  // An unbracketed value with several colons is not a valid Host header.
  if (colonCount > 1) return '';
  return colonCount === 1 ? host.slice(0, host.indexOf(':')) : host;
}

export function isLocalHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  return ALLOWED_HOSTNAMES.has(extractHostname(hostHeader));
}

export interface CrossSiteInput {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  secFetchMode: string | null;
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return isLocalHost(url.host);
  } catch {
    return false; // unparseable, including the literal "null"
  }
}

/**
 * True when the request looks like it was triggered by another website (CSRF /
 * cross-origin fetch) rather than by this app or a direct client such as curl.
 */
export function isCrossSiteBlocked(input: CrossSiteInput): boolean {
  const method = input.method.toUpperCase();
  const safe = method === 'GET' || method === 'HEAD';
  const { origin, secFetchSite, secFetchMode } = input;

  if (origin !== null && !isLocalOrigin(origin)) return true;

  const site = secFetchSite === null ? null : secFetchSite.toLowerCase();
  if (site === 'same-origin' || site === 'none') return false;
  if (site !== null) {
    // same-site, cross-site or an unknown value: only a top-level navigation is tolerated.
    const navigation = safe && (secFetchMode ?? '').toLowerCase() === 'navigate';
    return !navigation;
  }

  // No Sec-Fetch-Site. Safe methods pass; anything else needs a (local) Origin as proof.
  if (safe) return false;
  return origin === null;
}
