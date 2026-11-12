/**
 * HTML of a page after its JavaScript ran, via headless Chromium, or null when
 * Playwright or a browser is unavailable. Many company career sites render their
 * job list client-side, so a plain fetch sees an empty shell.
 * CHROMIUM_PATH can point at an already-installed Chromium (no browser download).
 */
/**
 * True for loopback, private, link-local and internal host names. Judges the host
 * name only. shortcut: no DNS lookup, so a public name that resolves to a private
 * address (DNS rebinding) is not caught; upgrade if untrusted URLs are ever scanned.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export async function renderPage(url: string, timeoutMs = 25000): Promise<string | null> {
  const moduleName = 'playwright'; // runtime import: the build must not need it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pw: any = await import(/* webpackIgnore: true */ moduleName).catch(() => null);
  if (!pw?.chromium) return null;
  let browser;
  try {
    browser = await pw.chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
    });
    const page = await browser.newPage();
    // Every request, including redirect hops and subresources, must stay on the public web.
    await page.route('**/*', (route: { request(): { url(): string }; abort(): Promise<void>; continue(): Promise<void> }) => {
      try {
        const u = new URL(route.request().url());
        if (/^https?:$/.test(u.protocol) && !isPrivateHost(u.hostname)) return route.continue();
      } catch {
        // unparseable URL: fall through to abort
      }
      return route.abort();
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    return await page.content();
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
