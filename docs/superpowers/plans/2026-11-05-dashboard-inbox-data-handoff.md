# Dashboard, Inbox & Data — User Setup & Verification Handoff

This checklist covers the manual environment, database, and profile steps that only you can run with your real credentials.

> **Plain disclosure:** The agent did **not** connect to any live Supabase/Postgres database and did **not** run the anon-key `curl` check below, because no database credentials exist in this checkout. All automated tests and UI checks ran against in-process PGlite.

---

## 1. Fix Your Master Profile Phone Number Before Anything Can Be Sent

`src/domain/profile/master-profile.json` currently has the placeholder phone number `+66 81 234 5678`. Your real phone number is `+66 95 045 7333`.

Because `npm run sync-profile` (`scripts/sync-profile.mjs`) overwrites `master-profile.json` from your sibling `C:\save\Projects\PersonalWebsite` database:
1. Update the phone number to `+66 95 045 7333` in the **PersonalWebsite** database (or in `scripts/sync-profile.mjs` if hardcoded there).
2. Run `npm run sync-profile` (or update `src/domain/profile/master-profile.json` directly if not re-syncing) and confirm `+66 95 045 7333` appears on `/profile`.
3. **Nothing may be sent to any company until this phone number is fixed.**

---

## 2. Configure `DATABASE_URL` in `.env.local`

1. Create or open your Supabase project (`Project Settings` → `Database` → `Connection string`).
2. Copy the **pooled** connection string and set it as `DATABASE_URL` in `.env.local` (make sure `DEV_DB_DIR` is **unset** when `DATABASE_URL` is set).
3. Follow the strict connection string rules enforced by `src/lib/sql.ts`:
   - **TLS is mandatory for remote hosts:** Append `?sslmode=require` (or `verify-full` / `verify-ca`).
   - **Allowed query parameters only:** Only `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, `application_name`, and `connect_timeout` are accepted. **Remove any other query parameters** that Supabase includes by default, such as `?pgbouncer=true` or `&connection_limit=...` — `src/lib/sql.ts` will reject the URL with `DATABASE_URL has conflicting TLS or host parameters` if unknown parameters are present.
   - **URL-encode special characters in the password:** If your database password contains `@`, `:`, `/`, `?`, `#`, `%`, etc., percent-encode them so the URL parser does not reject the connection string.
   - **Supabase CA certificate (`sslrootcert`):** Newer `pg-connection-string` treats `sslmode=require` as an alias for `verify-full` and verifies the server certificate chain. If Node/pg rejects Supabase's certificate chain:
     - **Recommended:** Download your project's Supabase root CA certificate (`prod-ca-2021.crt`) from Supabase Database Settings and add `&sslrootcert=/absolute/path/to/prod-ca-2021.crt` to `DATABASE_URL` (note: `sslrootcert`/`sslcert`/`sslkey` files are read at URL validation time).
     - **Fallback Note:** `src/lib/sql.ts` intentionally rejects `sslmode=no-verify` (`rejectUnauthorized: false`) to prevent silent MITM/plaintext downgrade on PII data. Supplying `sslrootcert` (or setting `NODE_EXTRA_CA_CERTS=/path/to/prod-ca-2021.crt` in your shell) is required when the system trust store does not include Supabase's CA.

---

## 3. Run Database Migrations and Import Legacy Jobs

With `DATABASE_URL` set in `.env.local` (or exported in your shell):

```bash
npm run db:migrate
npm run db:import-legacy
```

- `npm run db:migrate` applies `supabase/migrations/0001_auto_apply_core.sql` and `0002_runs_single_running.sql`.
- `npm run db:import-legacy` imports existing scraped jobs from `src/domain/jobs/jobs.json` into `job_applications` (idempotent; safe to re-run).

---

## 4. Verify Strict Row-Level Security (Anon Key Cannot Read Rows)

Migration `0001_auto_apply_core.sql` enables RLS on all tables with **no policies** and drops the old permissive policy on `job_applications`. Verify against your live Supabase project that the public `anon` key cannot read your data:

```bash
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/job_applications?select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

- **Expected result:** `[]` (empty JSON array) or a permission error — **never** application rows.
- *(Reminder: This check was **not** executed by the agent because no Supabase credentials exist in this checkout.)*

---

## 5. Known Limits in Sub-Project 1

- **Answer-bank matching is by normalized text:** `normalizeQuestionKey` normalizes case, Unicode NFKC, and punctuation/whitespace (preserving Thai characters and vowel/tone marks), so an identically phrased question is answered automatically from the bank, while a rephrased question with different words will surface as a new Inbox question.
- **Runs execute in-process:** Clicking **Run** executes the pipeline steps synchronously in the server process and returns when finished. Later sub-projects that add long-running browser automation will move execution to a background worker.
- **Standalone Facebook CLI (`npm run scrape:fb`):** Still writes to `src/domain/jobs/jobs.json`; run `npm run db:import-legacy` afterwards (or trigger a scrape from `/sources/facebook`) to sync new CLI captures into Postgres.
- **Real-database verification is your step:** All automated tests (307+ unit/integration tests) and browser checks ran against PGlite.
