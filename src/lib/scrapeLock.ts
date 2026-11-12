// Both Facebook scrapers drive the same persistent Chromium profile; two at once break it.
// On globalThis so Next's per-route bundles share one flag.
const g = globalThis as unknown as { __fbScrapeBusy?: boolean };

/** Returns a release function, or null when a scrape is already running. */
export function tryLockScrape(): (() => void) | null {
  if (g.__fbScrapeBusy) return null;
  g.__fbScrapeBusy = true;
  return () => {
    g.__fbScrapeBusy = false;
  };
}
