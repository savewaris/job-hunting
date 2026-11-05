/** Loads .env.local then .env into process.env (existing variables win). Missing files are fine. */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // file missing: fine, DATABASE_URL may come from the real environment
    }
  }
}
