/**
 * HTML of a page after its JavaScript ran, via headless Chromium, or null when
 * Playwright or a browser is unavailable. Many company career sites render their
 * job list client-side, so a plain fetch sees an empty shell.
 * CHROMIUM_PATH can point at an already-installed Chromium (no browser download).
 */
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
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    return await page.content();
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
