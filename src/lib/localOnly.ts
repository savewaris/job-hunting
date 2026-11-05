// Edge-runtime safe: no Node APIs, no imports.
const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function extractHostname(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith('[')) {
    // Bracketed IPv6, e.g. "[::1]:3000" -> "::1"
    const end = host.indexOf(']');
    if (end === -1) return '';
    const rest = host.slice(end + 1);
    if (rest !== '' && !/^:\d+$/.test(rest)) return '';
    return host.slice(1, end);
  }
  const colonCount = host.split(':').length - 1;
  // A bare (unbracketed) IPv6 literal has several colons; treat it as the hostname.
  if (colonCount > 1) return host;
  return colonCount === 1 ? host.slice(0, host.indexOf(':')) : host;
}

export function isLocalHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  return ALLOWED_HOSTNAMES.has(extractHostname(hostHeader));
}
