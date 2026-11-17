# Thai/Bangkok Job Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make discovery find Thai-language and Bangkok roles first, with no scraping of JobsDB/JobThai and no new AI calls.

**Architecture:** Extend the existing deterministic discovery in `src/domain/companies/discover.ts` (Thai terms, Bangkok-first ordering, a shared `saveDiscoveredRole`), seed verified Bangkok companies by migration, and add a pure parser for JobsDB/JobThai alert emails the owner already receives, fed through one local API route.

**Tech Stack:** TypeScript, Next.js 14 route handlers, cheerio (already a dependency), vitest + in-memory PGlite (`tests/helpers/testDb.ts`).

**Spec:** `docs/superpowers/specs/2026-11-17-agentic-mcp-thai-finder-design.md` (slice 1 of 4).

## Global Constraints

- Never fetch or scrape jobsdb.com / jobthai.com pages; alert emails are parsed offline only (spec non-goals).
- No new LLM calls; matching is regex/keyword only.
- Domain code stays in `src/domain/*`, imported via `@/` alias; API routes use `ok()` / `fail()` from `src/lib/http.ts` and `export const dynamic = 'force-dynamic'`.
- Server stays local-only (`127.0.0.1`); no new network exposure.
- Existing duplicate rules stay: skip same company+title (case-insensitive) and `ConflictError` on same external id.
- JS `\b` is ASCII-only: Thai terms must not be wrapped in `\b`.
- Run tests with `npx vitest run --maxWorkers=4`.

## Review Focus

- Thai text next to Latin text ("นักพัฒนา Full Stack") must still match; `\b` breaks on Thai (Task 1 test).
- A non-Bangkok Thai city (เชียงใหม่) stays ignored, as today (Task 1 test).
- Bangkok roles must win the daily quota over remote roles even when remote companies sort first (Task 2 test).
- Same role arriving from a company board and an alert email must not be saved twice (Task 4 test).
- Alert email with zero jobs, or garbage HTML, returns `found: 0` and creates nothing (Task 4 test).
- Oversized or non-string request body to the alert route is rejected, not parsed (Task 4 test).
- Tracking-redirect job links: alert parser must store the link as given and never request it (Task 4 test with a fetch spy asserting zero calls).

---

### Task 1: Thai-aware role classification

**Files:**
- Modify: `src/domain/companies/discover.ts:25-32` (the three regexes)
- Create: `tests/domain/thaiDiscovery.test.ts`

**Interfaces:**
- Consumes: existing `classifyRoleStatus(title, location, description?)`.
- Produces: same signature, now Thai-aware. Tasks 2 and 4 rely on it.

- [ ] **Step 1: Write failing tests** in `tests/domain/thaiDiscovery.test.ts`:
  - `classifyRoleStatus('นักพัฒนาซอฟต์แวร์ Full Stack', 'กรุงเทพมหานคร')` → `'wishlist'`
  - `classifyRoleStatus('วิศวกรซอฟต์แวร์อาวุโส', 'กรุงเทพ')` → `'maybe'`
  - `classifyRoleStatus('พนักงานขาย', 'กรุงเทพ')` → `'ignore'`
  - `classifyRoleStatus('Developer', 'เชียงใหม่')` → `'ignore'`
  - `classifyRoleStatus('Developer', 'ประเทศไทย')` → `'wishlist'`
- [ ] **Step 2: Run** `npx vitest run tests/domain/thaiDiscovery.test.ts` → expect FAIL on the Thai cases.
- [ ] **Step 3: Extend the regexes.** Add Thai alternatives outside any `\b` group: role (`นักพัฒนา`, `โปรแกรมเมอร์`, `วิศวกรซอฟต์แวร์`), location (`กรุงเทพ`, `ประเทศไทย`), senior (`อาวุโส`, `หัวหน้า`, `ผู้จัดการ`). Keep the existing English alternatives untouched.
- [ ] **Step 4: Run** the new file and `tests/domain/autoApply.test.ts` → all PASS (English behavior unchanged).
- [ ] **Step 5: Commit** `feat(discovery): match Thai role, location and seniority terms`.

---

### Task 2: Shared save helper and Bangkok-first ordering

**Files:**
- Modify: `src/domain/companies/discover.ts` (extract save logic from lines ~401-427; reorder loop at ~393)
- Modify: `tests/domain/thaiDiscovery.test.ts`

**Interfaces:**
- Consumes: `classifyRoleStatus` (Task 1), `createApplication`, `ConflictError`.
- Produces (exported from `discover.ts`):
  - `locationTier(location: string): 0 | 1` — `0` if it matches Bangkok/กรุงเทพ/Thailand/ประเทศไทย, else `1`.
  - `saveDiscoveredRole(sql: Sql, role: DiscoveredRole, status: ApplicationStatus): Promise<'created' | 'duplicate'>` — does the company+title duplicate check then `createApplication`; maps `ConflictError` to `'duplicate'`; rethrows anything else.

- [ ] **Step 1: Write failing tests:**
  - `locationTier('Bangkok, Thailand')`, `locationTier('กรุงเทพมหานคร')` → `0`; `locationTier('Remote (Worldwide)')` → `1`.
  - Ordering: with a Greenhouse fetch spy keyed on the URL slug, company "Aardvark Remote" (2 Remote roles, sorts first) and "Bangkok Co" (1 Bangkok role), call `discoverFromCompanyCareers(sql, 1)` → exactly the Bangkok role is saved.
  - `saveDiscoveredRole` twice with the same role → `'created'` then `'duplicate'`.
  - Existing tests in `tests/domain/autoApply.test.ts` (repost, malformed batch) still pass.
- [ ] **Step 2: Run** → FAIL (exports missing).
- [ ] **Step 3: Implement the exports; in `discoverFromCompanyCareers` build two queue sets (tier 0 roles, then tier 1 roles) and run the existing round-robin loop over tier 0 first, then tier 1, sharing the `maxNewRoles` quota.** Replace the inline duplicate check/create with `saveDiscoveredRole`; keep the `errors` counter behavior for rethrown errors.
- [ ] **Step 4: Run** `npx vitest run tests/domain` → PASS.
- [ ] **Step 5: Commit** `feat(discovery): prefer Bangkok roles and share save helper`.

---

### Task 3: Verified Bangkok target companies

**Files:**
- Create: `supabase/migrations/0005_bangkok_companies.sql`
- Read first: `src/domain/companies/probe.ts` (`probeCompanyBoard` signature) and `0004_fix_stale_company_boards.sql` (boards go stale, so verify before seeding).

**Interfaces:**
- Consumes: `probeCompanyBoard` to confirm a board exists; the `target_companies` schema from `0003`.
- Produces: new enabled rows in `target_companies` (name, careers_url, ats_type, ats_slug, `location_hint = 'Bangkok, Thailand'`).

- [ ] **Step 1: Ask the owner for candidate Bangkok companies** (memory notes LINE MAN as one) — only the owner can choose targets.
- [ ] **Step 2: Probe each candidate** with `probeCompanyBoard` in a throwaway `npx tsx` one-liner; keep only companies that return a live board with at least one role.
- [ ] **Step 3: Write `0005_bangkok_companies.sql`** with `INSERT ... ON CONFLICT (careers_url) DO NOTHING` for the verified rows only.
- [ ] **Step 4: Run** `npx vitest run tests/db tests/lib/migrate.test.ts` → PASS (migrations apply on a fresh DB; the `ats_type` CHECK rejects bad rows).
- [ ] **Step 5: Commit** `feat(discovery): seed verified Bangkok companies`.

---

### Task 4: JobsDB/JobThai alert-email parser and route

**BLOCKED until the owner supplies one real alert email from each of JobsDB and JobThai** (HTML, personal details removed) saved as `tests/fixtures/alerts/jobsdb-1.html` and `tests/fixtures/alerts/jobthai-1.html`. Do not guess the markup.

**Files:**
- Create: `src/domain/jobs/alertEmail.ts`
- Create: `src/app/api/jobs/alert-email/route.ts`
- Create: `tests/domain/alertEmail.test.ts`, `tests/api/alertEmail.test.ts`

**Interfaces:**
- Consumes: `classifyRoleStatus` (Task 1), `saveDiscoveredRole` and `DiscoveredRole` (Task 2), cheerio.
- Produces:
  - `type AlertSource = 'jobsdb' | 'jobthai'`
  - `parseJobAlertEmail(html: string, source: AlertSource): DiscoveredRole[]` — pure, never fetches; `source` field is `jobsdb_alert` / `jobthai_alert`; `contactMethod` is `{ type: 'portal', value: jobUrl }`; `externalId` is `<source>-alert-<job id from URL, else the URL>`.
  - `ingestAlertEmail(sql: Sql, html: string, source: AlertSource): Promise<{ found: number; created: number; duplicates: number }>`
  - `POST /api/jobs/alert-email` body `{ source, html }` → `ok({ found, created, duplicates })`; `fail` with 400 for bad source, non-string html, or html over 1,000,000 characters.

- [ ] **Step 1: Write failing tests:**
  - Each fixture parses to the job count, titles, companies and locations the owner confirms by eye (assert those exact values).
  - Zero-job email and `'<html></html>'` → `[]`.
  - A fetch spy is called 0 times during `parseJobAlertEmail` and `ingestAlertEmail`.
  - Ingesting the same fixture twice → second call `created: 0`, `duplicates === found`.
  - A role already saved from a company board (same company+title) → counted as duplicate.
  - Route: valid body → 200 with counts; `source: 'linkedin'` → 400; `html: 5` → 400; 1,000,001-char html → 400.
- [ ] **Step 2: Run both files** → FAIL (modules missing).
- [ ] **Step 3: Implement the parser, `ingestAlertEmail` (parse → classify → `saveDiscoveredRole`, skipping `'ignore'`) and the route.** Follow the route/test pattern in `src/app/api/jobs/route.ts` and `tests/api/jobs.test.ts`.
- [ ] **Step 4: Check drafting of portal roles.** Run a test that a saved `portal` role passes `prepareApplicationDraftsStep` as an approval item (`steps.ts` treats non-email as a form/URL apply) and is never auto-emailed; fix only if it is.
- [ ] **Step 5: Run** `npx vitest run --maxWorkers=4` → full suite PASS.
- [ ] **Step 6: Commit** `feat(discovery): ingest JobsDB/JobThai alert emails offline`.

---

## Self-review

- Spec slice 1 sources covered: Bangkok company pages (Task 3), alert emails (Task 4), Thai/Bangkok-first ranking (Tasks 1–2). Facebook scraper and Gmail fetching are explicitly out of this plan (spec open items).
- Names consistent: `locationTier`, `saveDiscoveredRole`, `parseJobAlertEmail`, `ingestAlertEmail`, `AlertSource` used identically across tasks.
- Known gap: alert emails carry no full job description, so tailoring for those roles works from title/company only until the owner opens the posting by hand.
