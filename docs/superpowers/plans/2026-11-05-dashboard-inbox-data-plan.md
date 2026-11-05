# Dashboard, Inbox and Data — Implementation Plan (sub-project 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the JSON-file storage with Postgres and build the dashboard: Inbox, answer bank, application board, metrics, settings and a Run button, ready for the later sub-projects to plug into.

**Architecture:** Server-side only data layer (`src/domain/*`) written against a tiny `Sql` interface (`query` + `exec`). Production uses `pg` against the Supabase Postgres connection string; tests and local verification use PGlite (real Postgres in-process), so tests run real SQL with the real migrations. Pages are Server Components reading the repos directly; client components mutate through `/api/*` routes and call `router.refresh()`. The whole app is bound to localhost and rejects non-local Host headers.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind (dark theme), lucide-react, `pg`, `@electric-sql/pglite` (dev), Vitest, `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-05-auto-apply-workflow-design.md` (sections 5 sub-project 1, 8, 8a-data-only, 9, 11, 13, 15a). Sub-projects 2-5 get their own plans.

## Global Constraints

- Single user, no login. App runs on the user's PC only: bind to `127.0.0.1`, reject any request whose Host is not localhost (spec 13, 15a).
- Supabase is used as hosted Postgres only. Browser/anon key access must be impossible: new tables have RLS enabled with **no** policies, and the old permissive `job_applications` policy is dropped. (Plan decision, stricter than the permissive-RLS note in `supabase/schema.sql`; flagged for user review.)
- Application statuses (exact strings): `maybe`, `wishlist`, `applied`, `interviewing`, `offer`, `rejected`, `skipped`. "Needs your input" is **derived** from open inbox items, never stored on the application.
- Board columns left to right: Needs your input, Maybe, Wishlist, Applied, Interviewing, Offer, Rejected.
- Inbox is the first section on the dashboard (spec 9). Run button is the only run trigger; the schedule setting is stored but shown disabled with the text "Scheduling isn't built yet" (spec 11).
- Default `max_daily_drafts` = 20, allowed range 1-200 (range is my call).
- API routes return `{ success: true, ...payload }` or `{ success: false, error }` with a 4xx/5xx status (existing convention, `CLAUDE.md`).
- Dark theme only: `bg-[#090d16]`, slate palette, `lucide-react` icons (existing convention).
- Reply rates use a rolling 7-day window for "sent this week".
- No change to `src/domain/profile/` or `scripts/sync-profile.mjs`; the Master Profile stays a JSON file (my call: that script regenerates it from the PersonalWebsite database).
- Commit messages end with the attribution line the session provides.

## Review Focus

Input classes the spec implies but nobody tests; each has a named test in the owning task.

1. Double-click / second tab answers an inbox item that is already answered or dismissed → second call must fail with 409 and must not overwrite the first answer (Task 7).
2. Thai or punctuation-only question text → answer-bank key is never empty and Thai letters survive normalisation (Task 6).
3. Zero applications, or applied with no dates → rates are `null`, never `NaN` or `Infinity` (Task 8).
4. Two runs create the same question for the same job → exactly one open inbox item (Task 6).
5. Host header variants: `localhost:3000`, `LOCALHOST`, `[::1]:3000`, and the spoof `localhost.evil.com` (Task 3).

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/sql.ts` | `Sql` interface, `getDb()`, `setDb()`, `createPgSql(connectionString)` |
| `src/lib/migrate.ts` | `applyMigrations(sql, dir)` |
| `src/lib/localOnly.ts`, `src/middleware.ts` | Host check + enforcement |
| `supabase/migrations/0001_auto_apply_core.sql` | All sub-project 1 tables |
| `src/domain/applications/` | `types.ts`, `repo.ts`, `legacy.ts` (JSON import + adapters) |
| `src/domain/answers/` | `key.ts`, `repo.ts` (answer bank, `askOrRecall`) |
| `src/domain/inbox/` | `repo.ts` |
| `src/domain/settings/repo.ts`, `src/domain/runs/` (`repo.ts`, `orchestrator.ts`, `steps.ts`) | settings and runs |
| `src/domain/metrics/compute.ts` | Pure metrics |
| `src/lib/http.ts` | `ok()`, `fail()` response helpers |
| `src/app/api/{applications,inbox,answers,settings,runs}/…` | Route handlers |
| `src/app/page.tsx`, `src/app/profile/page.tsx`, `src/app/sources/facebook/page.tsx`, `src/components/dashboard/*` | UI |
| `tests/helpers/testDb.ts` | `createTestDb()` — PGlite with all migrations applied |
| `scripts/migrate.ts`, `scripts/import-legacy-jobs.ts`, `scripts/seed-dev.ts` | CLI tools (run with `tsx`) |

---

### Task 1: Tooling and the `Sql` abstraction

**Files:**
- Modify: `package.json` (deps + scripts), `.env.example`, `.gitignore` (`/.dev-db/`)
- Create: `vitest.config.ts`, `src/lib/sql.ts`, `src/lib/migrate.ts`, `scripts/migrate.ts`, `tests/helpers/testDb.ts`, `tests/lib/migrate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/lib/sql.ts
  export interface Sql {
    query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
    exec(text: string): Promise<void>;           // multi-statement, no params
  }
  export function getDb(): Sql;                  // throws "DATABASE_URL is not set" if unset and no override
  export function setDb(sql: Sql | null): void; // test/dev override
  export function createPgSql(connectionString: string): Sql;
  // src/lib/migrate.ts
  export function applyMigrations(sql: Sql, dir: string): Promise<string[]>; // returns names newly applied, sorted by filename
  // tests/helpers/testDb.ts
  export function createTestDb(): Promise<Sql>;  // fresh in-memory PGlite, supabase/migrations applied
  ```

- [ ] **Step 1: Install** `npm i pg` and `npm i -D vitest @electric-sql/pglite @types/pg tsx`. Add scripts `"test": "vitest run"`, `"db:migrate": "tsx scripts/migrate.ts"`; change `"dev"` to `"next dev -H 127.0.0.1"` and `"start"` to `"next start -H 127.0.0.1"`.
- [ ] **Step 2: Write failing test** `tests/lib/migrate.test.ts` using a temp dir with `0001_a.sql` (`CREATE TABLE a(id int);`) and `0002_b.sql`:
  - `applies files in filename order and returns their names` → `['0001_a.sql','0002_b.sql']`
  - `is idempotent: second run applies nothing` → `[]`
  - `a failing file rolls back that file and stops` → a file with `CREATE TABLE c(id int); SELECT * FROM missing;` leaves no table `c` and no row in `schema_migrations`.
- [ ] **Step 3: Run** `npx vitest run tests/lib/migrate.test.ts` → FAIL (module missing).
- [ ] **Step 4: Implement** `sql.ts`, `migrate.ts` (tracks applied names in a `schema_migrations(name text primary key, applied_at timestamptz)` table; each file runs inside `BEGIN … COMMIT` via `exec`), `testDb.ts` (wrap PGlite's `query`/`exec` to the `Sql` shape), `vitest.config.ts` (alias `@` → `src`, `include: ['tests/**/*.test.ts']`, `environment: 'node'`). `scripts/migrate.ts` reads `DATABASE_URL`, applies `supabase/migrations`, prints names applied. `.env.example`: add `DATABASE_URL=` with a comment "Supabase → Project Settings → Database → connection string (use the pooled string)".
- [ ] **Step 5: Run** the same test → PASS.
- [ ] **Step 6: Commit** `chore: add vitest, pglite and Sql abstraction with migration runner`

---

### Task 2: Core schema migration

**Files:**
- Create: `supabase/migrations/0001_auto_apply_core.sql`, `tests/db/schema.test.ts`

**Interfaces:**
- Consumes: `createTestDb()`.
- Produces (table/column contract all later tasks use):
  - `job_applications` (create-if-not-exists with the old columns `id uuid default gen_random_uuid()`, `company_name`, `job_title`, `job_url`, `location`, `job_type`, `salary_range`, `status text default 'wishlist'`, `match_score`, `job_description`, `requirements text[]`, `applied_date date`, `notes`, `created_at`, `updated_at`; **no** `user_id` in the create — real DB keeps its existing one) then `ADD COLUMN IF NOT EXISTS`: `source text`, `external_id text`, `contact_method jsonb`, `raw_post_content text`, `status_changed_at timestamptz`, `first_response_at timestamptz`, `interviewed_at timestamptz`, `offered_at timestamptz`; unique index on `(source, external_id) WHERE external_id IS NOT NULL`.
  - `inbox_items(id uuid pk, job_application_id uuid null → job_applications on delete cascade, kind text check in ('question','approval','error'), prompt text not null, question_key text null, payload jsonb default '{}', status text default 'open' check in ('open','answered','dismissed'), decision text null check in ('answered','approved','skipped'), answer text null, resumed_at timestamptz null, created_at, resolved_at)`; partial unique index on `(job_application_id, question_key) WHERE status = 'open' AND kind = 'question'`.
  - `answer_bank(key text pk, question_text text not null, answer text not null, updated_at)`.
  - `skip_reasons(id, job_application_id → job_applications on delete cascade, reason text not null, note text, created_at)`.
  - `app_settings(id int pk check (id = 1), schedule_enabled bool default false, max_daily_drafts int default 20 check between 1 and 200)` with row `id=1` inserted `ON CONFLICT DO NOTHING`.
  - `runs(id uuid pk, status text check in ('running','succeeded','failed'), started_at, finished_at, summary jsonb default '{}')`.
  - Every new table: `ENABLE ROW LEVEL SECURITY` and no policy. Final lines: `DROP POLICY IF EXISTS "Permissive (no-auth) access to job applications" ON public.job_applications;` and `ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;`.

- [ ] **Step 1: Write failing tests** in `tests/db/schema.test.ts`:
  - `app_settings has exactly one row with schedule off and 20 drafts` → `{schedule_enabled:false, max_daily_drafts:20}`
  - `app_settings rejects a second row` (insert id=2 throws)
  - `app_settings rejects max_daily_drafts 0 and 201`
  - `inbox_items rejects an unknown kind`
  - `two open questions with the same job and key violate the unique index`; the same pair is allowed once the first is `answered`
  - `answer_bank key is unique`
  - `deleting a job_application cascades to inbox_items and skip_reasons`
- [ ] **Step 2: Run** `npx vitest run tests/db` → FAIL.
- [ ] **Step 3: Write the migration** to the contract above.
- [ ] **Step 4: Run** → PASS. Also run `npx vitest run` to confirm Task 1 still passes with the real migrations directory.
- [ ] **Step 5: Commit** `feat(db): core schema for applications, inbox, answer bank, settings, runs`

---

### Task 3: Local-only guard

**Files:**
- Create: `src/lib/localOnly.ts`, `src/middleware.ts`, `tests/lib/localOnly.test.ts`

**Interfaces:**
- Produces: `export function isLocalHost(hostHeader: string | null): boolean`

- [ ] **Step 1: Write failing test** `isLocalHost`:
  - true for `localhost`, `localhost:3000`, `LOCALHOST:3000`, `127.0.0.1:3000`, `[::1]:3000`
  - false for `null`, `''`, `localhost.evil.com`, `evil.com`, `192.168.1.20:3000`, `127.0.0.1.evil.com`
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `isLocalHost` (strip port, lowercase, exact match against the allowed hostnames — no suffix or prefix matching). `middleware.ts`: for every request except `/_next/static`, `/_next/image` and `/favicon.ico`, return a 403 JSON `{ success:false, error:'Local access only' }` when `!isLocalHost(req.headers.get('host'))`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Probe the real safeguard (not only the unit).** Run `npm run dev`; then: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → 200; `curl -s -o /dev/null -w "%{http_code}" -H "Host: evil.com" http://127.0.0.1:3000/` → 403; from the machine's LAN IP (`ipconfig` → IPv4) `curl --max-time 3 http://<LAN-IP>:3000/` → connection refused/timeout. Record the three results in the commit body. If the LAN request connects, the bind flag did not take effect — fix before committing.
- [ ] **Step 6: Commit** `feat: bind to localhost and reject non-local Host headers`

---

### Task 4: Applications domain and routes

**Files:**
- Create: `src/domain/applications/types.ts`, `src/domain/applications/repo.ts`, `src/lib/http.ts`, `src/app/api/applications/route.ts`, `src/app/api/applications/[id]/route.ts`, `tests/domain/applications.test.ts`, `tests/api/applications.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const APPLICATION_STATUSES = ['maybe','wishlist','applied','interviewing','offer','rejected','skipped'] as const;
  export type ApplicationStatus = typeof APPLICATION_STATUSES[number];
  export const SKIP_REASONS = ['too_senior','bad_pay','not_interested_company','wrong_location','other'] as const;
  export interface Application { id: string; companyName: string; jobTitle: string; jobUrl: string|null; location: string|null; salaryRange: string|null;
    status: ApplicationStatus; source: string|null; externalId: string|null; appliedDate: string|null; statusChangedAt: string|null;
    firstResponseAt: string|null; interviewedAt: string|null; offeredAt: string|null; createdAt: string; needsInput: boolean }
  export function createApplication(sql: Sql, input: { companyName: string; jobTitle: string; jobUrl?: string; location?: string; salaryRange?: string; status?: ApplicationStatus; source?: string; externalId?: string; jobDescription?: string; requirements?: string[]; contactMethod?: {type:string;value:string}; rawPostContent?: string }): Promise<Application>;
  export function listApplications(sql: Sql): Promise<Application[]>;      // newest first; needsInput = has an open inbox item
  export function moveApplication(sql: Sql, id: string, status: ApplicationStatus, now?: Date): Promise<Application>; // throws NotFoundError
  export function skipApplication(sql: Sql, id: string, reason: typeof SKIP_REASONS[number], note?: string): Promise<Application>;
  export class NotFoundError extends Error {}
  export class ConflictError extends Error {}
  // src/lib/http.ts
  export function ok(payload?: object, status?: number): Response;
  export function fail(error: string, status: number): Response;
  ```
  Route behaviour: `GET /api/applications` → `{success,applications}`; `PATCH /api/applications/[id]` body `{status}` or `{skip:{reason,note?}}` → `{success,application}`; unknown id → 404; invalid status/reason or body → 400.

- [ ] **Step 1: Write failing domain tests:**
  - `moveApplication to applied sets applied_date to today and status_changed_at`
  - `moving to interviewing sets first_response_at and interviewed_at once; moving again does not overwrite them`
  - `moving to rejected after applied sets first_response_at but not interviewed_at`
  - `moving to offer sets offered_at`
  - `moving applied → wishlist keeps applied_date` (no history erased)
  - `moveApplication on an unknown id throws NotFoundError and writes nothing`
  - `skipApplication sets status skipped and stores the reason row`
  - `listApplications marks needsInput true only while an open inbox item exists` (insert an inbox row by SQL)
- [ ] **Step 2: Write failing route tests** (call `GET`/`PATCH` handlers directly after `setDb(await createTestDb())`): `PATCH with status "banana" → 400`, `PATCH unknown id → 404 and success:false`, `PATCH {skip:{reason:"bad_pay"}} → 200 and status "skipped"`, `PATCH {skip:{reason:"lol"}} → 400`.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** repo (timestamps set with `COALESCE(col, $now)` so first-time only) and routes (validate with the exported constants; map `NotFoundError`→404).
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat: applications repo, status moves with milestone timestamps, skip reasons`

---

### Task 5: Move captured jobs into the database

**Files:**
- Create: `src/domain/applications/legacy.ts`, `scripts/import-legacy-jobs.ts`, `tests/domain/legacy.test.ts`
- Modify: `src/app/api/jobs/route.ts`, `src/app/page.tsx` (temporary: stop calling `getSavedJobs`; Task 11 replaces the page), `package.json` (`"db:import-legacy"`)
- Keep untouched: `src/domain/jobs/index.ts` `parseJobText`; `saveJob`/`getSavedJobs` stay for the Facebook CLI scripts but are no longer used by the app routes.

**Interfaces:**
- Consumes: `createApplication`, `listApplications`.
- Produces:
  ```ts
  export function importLegacyJobs(sql: Sql, jobs: ScrapedJob[]): Promise<{ imported: number; skipped: number }>; // idempotent by (source, external_id = job.id); status 'wishlist'
  export function toScrapedJob(row: ApplicationRow): ScrapedJob; // adapter so GET /api/jobs keeps its existing response shape for FacebookScraperCard
  ```

- [ ] **Step 1: Write failing tests:** `imports the two jobs in src/domain/jobs/jobs.json` (read the real file) → `{imported:2, skipped:0}`; `second import reports skipped:2 and creates no duplicates`; `keeps contact_method, requirements and raw_post_content`; `toScrapedJob(createApplication(fromScrapedJob))` round-trips `jobTitle`, `companyName`, `contactMethod`, `requirements`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `legacy.ts` and `scripts/import-legacy-jobs.ts` (reads `jobs.json`, uses `createPgSql(DATABASE_URL)`, prints counts). Rewire `/api/jobs` GET to return `{success, jobs}` built with `toScrapedJob` from the DB, and POST to `createApplication` with `source:'facebook'` and `externalId` = parsed id (still `parseJobText`).
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` → both clean.
- [ ] **Step 5: Commit** `feat: store captured jobs in Postgres and add legacy JSON import`

---

### Task 6: Answer bank and `askOrRecall`

**Files:**
- Create: `src/domain/answers/key.ts`, `src/domain/answers/repo.ts`, `src/app/api/answers/route.ts`, `src/app/api/answers/[key]/route.ts`, `tests/domain/answers.test.ts`, `tests/api/answers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function normalizeQuestionKey(text: string): string; // lowercase, keep only \p{L}\p{N} and single spaces, trim
  export function saveAnswer(sql: Sql, questionText: string, answer: string): Promise<AnswerEntry>;   // upsert by key
  export function listAnswers(sql: Sql): Promise<AnswerEntry[]>;
  export function deleteAnswer(sql: Sql, key: string): Promise<void>;
  export function askOrRecall(sql: Sql, input: { jobApplicationId: string; questionText: string }):
    Promise<{ kind: 'answered'; answer: string } | { kind: 'pending'; itemId: string }>;
  export interface AnswerEntry { key: string; questionText: string; answer: string; updatedAt: string }
  ```
  Routes: `GET /api/answers` → `{success,answers}`; `PUT /api/answers` body `{questionText,answer}`; `DELETE /api/answers/[key]`. Empty `questionText` or `answer` → 400.

- [ ] **Step 1: Write failing tests:**
  - `normalizeQuestionKey("  Expected   Salary?? ") === "expected salary"`
  - `normalizeQuestionKey("เงินเดือนที่คาดหวัง?")` is non-empty and contains Thai letters (Review Focus 2)
  - `normalizeQuestionKey("???")` returns `""` and `saveAnswer`/`askOrRecall` throw `Error('Question has no usable text')` for it
  - `askOrRecall recalls a saved answer without creating an inbox item`, including for a differently cased and punctuated repeat of the question
  - `askOrRecall creates one open question item the first time and returns the same itemId when called again for the same job and key` (Review Focus 4)
  - `a second job asking the same unanswered question gets its own open item` (two items, same key)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Create-or-return uses `INSERT … ON CONFLICT (job_application_id, question_key) WHERE status='open' AND kind='question' DO NOTHING` then selects the existing row; it must be safe if two runs race.
- [ ] **Step 4: Run** → PASS. Add and pass the route tests (`PUT` empty answer → 400; `GET` after `PUT` lists it).
- [ ] **Step 5: Commit** `feat: answer bank with normalised keys and askOrRecall`

---

### Task 7: Inbox domain and routes

**Files:**
- Create: `src/domain/inbox/repo.ts`, `src/app/api/inbox/route.ts`, `src/app/api/inbox/[id]/resolve/route.ts`, `tests/domain/inbox.test.ts`, `tests/api/inbox.test.ts`

**Interfaces:**
- Consumes: `saveAnswer`, `normalizeQuestionKey`, `ConflictError`, `NotFoundError`.
- Produces:
  ```ts
  export interface InboxItem { id: string; jobApplicationId: string|null; companyName: string|null; jobTitle: string|null;
    kind: 'question'|'approval'|'error'; prompt: string; payload: Record<string, unknown>; status: 'open'|'answered'|'dismissed';
    decision: 'answered'|'approved'|'skipped'|null; answer: string|null; createdAt: string; resolvedAt: string|null }
  export function createInboxItem(sql: Sql, input: { jobApplicationId?: string; kind: InboxItem['kind']; prompt: string; payload?: object }): Promise<InboxItem>;
  export function listOpenInbox(sql: Sql): Promise<InboxItem[]>;  // oldest first, but kind 'approval'/'error' never hidden behind questions: order by created_at
  export function resolveInboxItem(sql: Sql, id: string,
    input: { decision: 'answered'|'approved'|'skipped'; answer?: string; saveToBank?: boolean }): Promise<InboxItem>; // 404 NotFoundError, 409 ConflictError if not open
  export function listAnsweredUnresumed(sql: Sql): Promise<InboxItem[]>;
  export function markResumed(sql: Sql, ids: string[]): Promise<void>;
  ```
  Routes: `GET /api/inbox` → `{success,items}`; `POST /api/inbox/[id]/resolve` body = `input` above → `{success,item}`; 400 on invalid decision, `answered` without non-empty `answer`, or `saveToBank` on a non-question; 404; 409.

- [ ] **Step 1: Write failing tests:**
  - `resolve answered stores the answer and status answered`
  - `saveToBank writes the answer under the normalised question key atomically` (the item update and the bank write both happen or neither: simulate by resolving with an item whose `prompt` normalises to empty → `ConflictError`/400, item stays open)
  - `resolving an already answered item throws ConflictError and keeps the first answer` (Review Focus 1)
  - `resolving a dismissed/skipped item twice throws ConflictError`
  - `resolve on unknown id throws NotFoundError`
  - `skipped decision sets status dismissed`; `approved` sets status answered
  - `listAnsweredUnresumed returns answered items until markResumed is called`
  - `listOpenInbox includes company and title from the joined application`
- [ ] **Step 2: Route tests:** `POST resolve with decision "answered" and empty answer → 400`; `second POST → 409 with the first answer unchanged`; `GET returns only open items`.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement.** The resolve update is guarded by `WHERE id=$1 AND status='open'` and the bank upsert happens in the same statement (CTE) so the pair is atomic; distinguish 404 vs 409 with a follow-up select only when zero rows updated.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat: inbox items with atomic resolve, bank saving and resume tracking`

---

### Task 8: Metrics

**Files:**
- Create: `src/domain/metrics/compute.ts`, `tests/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `Application` (fields `status`, `appliedDate`, `createdAt`, `firstResponseAt`, `interviewedAt`, `offeredAt`).
- Produces:
  ```ts
  export interface Metrics { total: number; byStatus: Record<ApplicationStatus, number>; applied: number; sentLast7Days: number;
    responseRate: number|null; interviewRate: number|null; offerRate: number|null; medianDaysToFirstReply: number|null }
  export function computeMetrics(apps: Application[], now: Date): Metrics;
  ```
  Definitions (exact): `applied` = apps with `appliedDate` set. `responseRate` = apps with `firstResponseAt` ÷ `applied`. `interviewRate` = apps with `interviewedAt` ÷ `applied`. `offerRate` = apps with `offeredAt` ÷ apps with `interviewedAt`. `sentLast7Days` = apps with `appliedDate` within the 7 days up to `now`. `medianDaysToFirstReply` over apps with both `appliedDate` and `firstResponseAt`. A rate whose denominator is 0 is `null`.

- [ ] **Step 1: Write failing tests:** `empty list gives zeros and null rates, no NaN` (Review Focus 3); `applied with no replies gives responseRate 0`; `3 applied, 1 replied, 1 interviewed → 1/3 and 1/3`; `offerRate is offers over interviewed, null when nobody interviewed`; `sentLast7Days counts day 7 and excludes day 8`; `median of an even number of reply times averages the middle two`; `byStatus has all seven keys even when zero`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (pure, no I/O). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: dashboard metrics computed from the user's own data`

---

### Task 9: Settings, runs and the Run orchestrator

**Files:**
- Create: `src/domain/settings/repo.ts`, `src/domain/runs/repo.ts`, `src/domain/runs/steps.ts`, `src/domain/runs/orchestrator.ts`, `src/app/api/settings/route.ts`, `src/app/api/runs/route.ts`, `tests/domain/settings.test.ts`, `tests/domain/runs.test.ts`, `tests/api/runs.test.ts`

**Interfaces:**
- Consumes: `listAnsweredUnresumed`, `markResumed`, `InboxItem`.
- Produces:
  ```ts
  export interface Settings { scheduleEnabled: boolean; maxDailyDrafts: number }
  export function getSettings(sql: Sql): Promise<Settings>;
  export function updateSettings(sql: Sql, patch: { maxDailyDrafts?: number }): Promise<Settings>; // RangeError outside 1-200 or non-integer
  export interface RunContext { sql: Sql; resumed: InboxItem[]; settings: Settings; now: Date }
  export interface RunStep { name: string; run(ctx: RunContext): Promise<Record<string, unknown>> } // returns summary fields
  export const runSteps: RunStep[];                    // plan 1 contains only resumeAnsweredInbox; later plans append
  export interface Run { id: string; status: 'running'|'succeeded'|'failed'; startedAt: string; finishedAt: string|null; summary: Record<string, unknown> }
  export function startRun(sql: Sql, steps?: RunStep[], now?: Date): Promise<Run>;
  export function listRecentRuns(sql: Sql, limit?: number): Promise<Run[]>;
  ```
  Behaviour: `startRun` refuses (ConflictError) if a run is `running` and started less than 30 minutes ago (older `running` rows are marked `failed` with `summary.error='stale'` first). Steps run in order; a thrown step marks the run `failed`, stores `summary.error` and `summary.failedStep`, and later steps do not run. `resumeAnsweredInbox` loads answered-unresumed items into `ctx.resumed`, calls `markResumed`, and returns `{ resumed: n }`. Routes: `POST /api/runs` → `{success,run}` (409 if already running); `GET /api/runs` → recent 5; `GET/PUT /api/settings` (PUT body `{maxDailyDrafts}`; a `scheduleEnabled` key in the body → 400 "Scheduling isn't built yet").

- [ ] **Step 1: Write failing tests:** `getSettings returns off and 20`; `updateSettings rejects 0, 201 and 2.5`; `startRun with the default steps succeeds with resumed 0 on an empty inbox`; `startRun resumes answered items once — a second run reports resumed 0`; `a throwing step marks the run failed, records failedStep, and skips later steps`; `a second startRun while one is running throws ConflictError`; `a running row older than 30 minutes is marked failed and a new run starts`; `route: PUT settings with scheduleEnabled → 400`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: settings, run records and the run orchestrator`

---

### Task 10: Dev data store and seed (verification aid)

**Files:**
- Modify: `src/lib/sql.ts` (when `DEV_DB_DIR` is set and `DATABASE_URL` is not, `getDb()` lazily opens a persistent PGlite at that directory and applies migrations), `.env.example`
- Create: `scripts/seed-dev.ts`, `tests/lib/devStore.test.ts`

**Interfaces:**
- Produces: `npm run db:seed-dev` — refuses to run unless `DEV_DB_DIR` is set and `DATABASE_URL` is unset (prints why and exits 1). Seeds: 3 inbox questions (one Thai), 1 approval item with `payload.preview` text, 1 error item, 12 applications spread across all statuses with milestone timestamps, 2 answer-bank entries, one finished run.

- [ ] **Step 1: Write failing tests:** `getDb uses DATABASE_URL when set`; `getDb throws a clear error when neither variable is set`; `seed-dev refuses when DATABASE_URL is set` (run the exported `assertDevOnly(env)` function).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** `@electric-sql/pglite` is imported dynamically only on the dev-store path so production never loads it. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: local dev store and seed data for UI verification`

---

### Task 11: Dashboard UI

**Files:**
- Create: `src/components/dashboard/{RunPanel,InboxPanel,MetricsStrip,Board,SettingsPanel}.tsx`, `src/app/answers/page.tsx`, `src/components/dashboard/AnswerBank.tsx`, `src/app/profile/page.tsx`, `src/app/sources/facebook/page.tsx`
- Modify: `src/app/page.tsx` (replace with the dashboard), `src/app/layout.tsx` (header links: Dashboard, Answers, Profile, Facebook paste)

**Interfaces:**
- Consumes: `listOpenInbox`, `listApplications`, `computeMetrics`, `getSettings`, `listRecentRuns`, `listAnswers`, and the routes from Tasks 4, 6, 7, 9. Pages use `export const dynamic = 'force-dynamic'` and pass plain JSON props; client components `fetch` then `router.refresh()`.
- Dashboard layout order: header with Run button and last-run status → **Inbox** → metrics strip → board → settings panel.

Behaviour to build (each is checked in Step 3):
- **InboxPanel:** empty state "Nothing needs you". Question items: text box + "Save to answer bank" checkbox (on by default) + Answer; approval items: show `payload.preview` and Approve / Skip buttons (Edit comes with sub-project 3); error items: Dismiss. Each shows company and title. Buttons disable while a request is in flight; a 409 shows "Already handled — refreshed" and refreshes.
- **Board:** seven columns in the order from Global Constraints; cards show company, title, location; a "Move to" select and a Skip button that asks for a reason from `SKIP_REASONS`.
- **MetricsStrip:** sent in last 7 days, response rate, interview rate, offer rate, median days to first reply; `null` renders "—" with the explanation "needs more data".
- **SettingsPanel:** max daily drafts number input (saves on blur; invalid shows the API error), schedule switch rendered disabled with "Scheduling isn't built yet".
- **RunPanel:** Run button; shows "Resumed N answered items" from the run summary; failed run shows its error text.

- [ ] **Step 1: Build** the components and pages to the behaviour above.
- [ ] **Step 2: Static checks:** `npx tsc --noEmit`, `npm run lint`, `npm run build` → all clean.
- [ ] **Step 3: Verify in a real browser** (required before calling UI done): `DEV_DB_DIR=.dev-db npm run db:seed-dev`, then `DEV_DB_DIR=.dev-db npm run dev`. With the Chrome tools open `http://localhost:3000`, take screenshots, and check every item: Inbox is the first section; answering the Thai question with "save to bank" removes it and it appears on `/answers`; approving the approval item removes it; pressing Run shows "Resumed 1 answered items" and a second press shows 0; moving a card changes its column and the metrics; skipping asks for a reason and the card leaves the board; double-clicking Answer does not show an error state; the schedule switch is disabled; resize to phone width (390px) and confirm no horizontal scroll. List anything not checked in the final report.
- [ ] **Step 4: Commit** `feat: dashboard with inbox, board, metrics, settings and run button`

---

### Task 12: Docs and the user's database hand-off

**Files:**
- Modify: `CLAUDE.md` (Data flow section: storage is Postgres via `src/lib/sql.ts`; profile still JSON; Facebook scripts still write `jobs.json` and the import script moves them), `STATUS.md` is left alone (generated).
- Create: `docs/superpowers/plans/2026-11-05-dashboard-inbox-data-handoff.md` — short checklist for the user.

- [ ] **Step 1: Update `CLAUDE.md`** (storage, new commands `test`, `db:migrate`, `db:import-legacy`, `db:seed-dev`, localhost binding, the strict-RLS decision).
- [ ] **Step 2: Write the hand-off checklist** of what only the user can do: create or open the Supabase project; copy the pooled connection string into `.env.local` as `DATABASE_URL`; run `npm run db:migrate` then `npm run db:import-legacy`; confirm the anon key cannot read: `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/job_applications?select=id" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"` must return `[]` or a permission error, never rows. State plainly that this last check was **not run by the agent** (no database credentials exist in this checkout).
- [ ] **Step 3: Full run:** `npx vitest run` (all pass), `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 4: Commit** `docs: describe the Postgres-backed dashboard and the user's setup steps`

---

## Self-review

- **Spec coverage:** Inbox + approvals + errors (T7, T11); answer bank + no repeat questions (T6); board columns + Maybe + Needs-input (T4, T11); skip with reason (T4, T11; rule suggestions are deferred to the plan for sub-project 2, which applies the filters); metrics (T8, T11); Run button + resume answered (T9, T11); schedule setting off and disabled (T2, T9, T11); max drafts 20 (T2, T9); storage move + legacy jobs (T2, T5); localhost-only (T3); dark theme and conventions (Global Constraints, T11); Gmail data and replies are sub-project 4 and are not touched, except that status milestone timestamps already exist for it to fill.
- **Types:** `Application`, `InboxItem`, `Sql`, `Settings`, `RunStep` are each defined once and referenced by the same names in later tasks.
- **Proportion:** the plan lists signatures, table contracts and named tests only; function bodies are left to the implementer.
- **Known limits to tell the user:** answer-bank matching is by normalised text, so a rephrased question counts as new; the Run executes in-process and returns when done (later plans with browser work will move it to a background process); real-database verification is the user's step.
