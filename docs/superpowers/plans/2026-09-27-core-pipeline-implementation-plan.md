# Core Pipeline (Phase A, Plan 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the smallest real end-to-end slice of the pipeline architecture: paste a Facebook job post → it lands in Supabase with real pipeline state → AI tailoring produces a resume rewrite + cold-email draft (gated by a toggle you control) → you review and edit the draft → you click Send and a real email goes out with a real PDF attached.

**Architecture:** Supabase replaces the current `fs`-based JSON files as the source of truth for jobs. A small orchestrator module (`src/domain/pipeline/`) checks a `pipeline_settings` singleton row before automatically advancing a job from `new` to `tailored`, and stops at an `error` state on failure rather than retrying silently. `@savewaris/ai-battery` (via a local `file:` dependency) provides the multi-provider AI fallback for tailoring; `@react-pdf/renderer` renders resume PDFs on demand at send time, never persisted to disk.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/supabase-js`), Vitest (new), `@savewaris/ai-battery` (new, local `file:` dependency), `nodemailer`, `@react-pdf/renderer`.

**Spec:** `docs/superpowers/specs/2026-09-27-job-hunting-pipeline-architecture-design.md` — this plan implements that spec's Phase A, scoped down further to exclude the scheduled multi-source ingestion (Greenhouse/Lever/Ashby/JobThai/JobsDB). That scheduled ingestion is deliberately deferred to its own follow-up plan: it's a separable subsystem (a standalone cron script, no UI dependency), and jobs it would bring in via a `form`/`portal`-only contact method can't be acted on yet anyway until Phase B (the Stagehand ATS agent) exists. This plan proves the pipeline architecture end-to-end on the one path that's fully actionable today — Facebook paste → tailor → cold email → send — which is exactly the vertical slice the spec's own §8 "Build order" says must be verified working before anything else is built on top of it.

## Pre-flight

Before Task 1: the working tree has a pre-existing uncommitted change to `src/domain/profile/master-profile.json` (a `syncedAt` timestamp bump from a prior `sync-profile.mjs` run). It doesn't conflict with anything this plan touches, but commit it on its own first so it doesn't get swept into Task 1's unrelated cleanup commit:

```bash
git add src/domain/profile/master-profile.json
git commit -m "chore: sync master profile timestamp"
```

## Global Constraints

- `pipeline_settings` is a singleton row (`id = 1`); `auto_tailor` defaults to `false`, `max_daily_auto_tailor` defaults to `20`.
- Cold-email **send** has no toggle, ever — it is always a manual click regardless of any other setting.
- No automatic re-tailoring when the master profile changes — a job already at `tailored` keeps its content until a manual "Re-tailor" action.
- `@savewaris/ai-battery` is a `file:` dependency (`"@savewaris/ai-battery": "file:../../../agent-second-brain/packages/ai-battery"`), using **job-hunting's own dedicated API keys** — never copy `GEMINI_API_KEY`/`GROQ_API_KEY`/`OPENROUTER_API_KEY`/`CEREBRAS_API_KEY` from `agent-second-brain`'s `.env`.
- `supabase/schema.sql` is extended in place with `ALTER`/`CREATE` statements, never replaced.
- RLS stays permissive (`USING (true)`) on every table — this is a single-user tool, consistent with the existing schema's documented trade-off.
- Vitest is the test runner; tests are scoped to the pipeline orchestrator and the job-text-parsing logic, not full app coverage.

## Review Focus

- Pasting the exact same Facebook post text twice must not create two `job_applications` rows — it must dedupe via `external_id`.
- With `auto_tailor` set to `false`, a newly ingested job must stay at `pipeline_stage = 'new'` — it must not get tailored automatically.
- Once `max_daily_auto_tailor` attempts have happened today, further jobs must stop chaining into tailoring and stay at `new`, not silently retry or error.
- A job whose only contact method is `line` or `portal` (no email) must reach `tailored` without a `cold_emails` draft ever being created for it, and without the tailor stage crashing.
- If every AI-battery provider fails, the job must land in `pipeline_stage = 'error'` with `stage_error` populated — not stay stuck at `tailoring` forever, and not crash the calling API route.

---

### Task 1: Delete the deprecated autonomous Facebook automation

The current Facebook scraper contradicts the project's own decision to keep Facebook sourcing human-driven (manual paste only, per the design spec §3 and §6). These scripts and routes automate a real personal Facebook login/session and must go before anything else in this plan, so no new code gets built alongside code that's about to be deleted.

**Files:**
- Delete: `scripts/facebook-cli.mjs`
- Delete: `scripts/init-facebook-session.mjs`
- Delete: `scripts/facebook-scraper.mjs`
- Delete: `scripts/scroll-facebook-jobs.mjs`
- Delete: `src/app/api/facebook/init-session/route.ts`
- Delete: `src/app/api/facebook/scroll-feed/route.ts`
- Delete: `src/app/api/facebook/status/route.ts`
- Delete: `src/app/api/jobs/scrape-facebook/route.ts`
- Delete: `.browser-sessions/` (directory)
- Modify: `package.json`

**Interfaces:** None — this task only removes code, it doesn't produce anything later tasks depend on.

- [ ] **Step 1: Delete the automation scripts and their API routes**

```bash
git rm scripts/facebook-cli.mjs scripts/init-facebook-session.mjs scripts/facebook-scraper.mjs scripts/scroll-facebook-jobs.mjs
git rm -r src/app/api/facebook
git rm src/app/api/jobs/scrape-facebook/route.ts
rm -rf .browser-sessions
```

- [ ] **Step 2: Remove the now-dead `scrape:fb` script from `package.json`**

In `package.json`, delete this line from `"scripts"`:

```json
"scrape:fb": "node scripts/facebook-cli.mjs"
```

- [ ] **Step 3: Verify the app still builds with the routes gone**

Run: `npm run build`
Expected: build succeeds. If it fails referencing any deleted file, find and remove that reference (there should be none — nothing else in `src/` imports these files).

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: remove autonomous Facebook login/scraping automation"
```

---

### Task 2: Supabase schema migration and client

**Files:**
- Modify: `supabase/schema.sql`
- Create: `src/lib/supabase.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `getSupabaseClient(): SupabaseClient` from `src/lib/supabase.ts`, used by every domain module in later tasks.

- [ ] **Step 1: Append the migration to `supabase/schema.sql`**

Add this to the end of the file (after the existing permissive-RLS policies):

```sql
-- ============================================================
-- Pipeline architecture migration (2026-09-27)
-- See docs/superpowers/specs/2026-09-27-job-hunting-pipeline-architecture-design.md
-- ============================================================

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'new',
    -- new, tailoring, tailored, sent, error
  ADD COLUMN IF NOT EXISTS stage_error TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
    -- facebook, greenhouse, lever, ashby, jobthai, jobsdb, manual
  ADD COLUMN IF NOT EXISTS external_id TEXT,
    -- dedup key: canonical job_url for API sources, content-hash of raw_post_content for pasted Facebook text
  ADD COLUMN IF NOT EXISTS contact_method_type TEXT,
    -- email, line, form, messenger, portal
  ADD COLUMN IF NOT EXISTS contact_method_value TEXT,
  ADD COLUMN IF NOT EXISTS raw_post_content TEXT,
  ADD COLUMN IF NOT EXISTS author TEXT,
  ADD COLUMN IF NOT EXISTS tailored_at TIMESTAMPTZ;
    -- set the moment a tailor attempt starts (success or failure), used for the daily cap

CREATE UNIQUE INDEX IF NOT EXISTS job_applications_external_id_idx
  ON public.job_applications (external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pipeline_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton row, single-user tool
  auto_ingest_api_sources BOOLEAN NOT NULL DEFAULT false,
  auto_tailor BOOLEAN NOT NULL DEFAULT false,
  max_daily_auto_tailor INTEGER NOT NULL DEFAULT 20,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.pipeline_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pipeline_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive (no-auth) access to pipeline settings" ON public.pipeline_settings FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Run the migration against the real Supabase project**

This is a manual step — open the Supabase project's SQL editor (or `psql` if connecting directly) and run the SQL block from Step 1 against the actual database. There is no local Supabase instance in this project, so this cannot be scripted from here.

- [ ] **Step 3: Add the Supabase client factory**

Create `src/lib/supabase.ts`:

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment.'
    );
  }

  client = createClient(url, key);
  return client;
}
```

- [ ] **Step 4: Verify the connection with a real query, not an assumption**

Run this one-off check (delete it after — it's a manual verification, not a kept file):

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
client.from('pipeline_settings').select('*').eq('id', 1).single()
  .then(({ data, error }) => { console.log('Row:', data, 'Error:', error); process.exit(error ? 1 : 0); });
"
```

Expected: prints the real singleton row (`auto_tailor: false`, `max_daily_auto_tailor: 20`, etc.) with `Error: null`. If this fails, the migration in Step 2 didn't run, or `.env.local` is missing the Supabase credentials — fix that before continuing; do not proceed on an assumption that the migration worked.

- [ ] **Step 5: Note the new required env vars**

Add to `.env.example` (values already documented there for Supabase — just confirm the comment reflects the new tables):

```
# NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (above) must point at a
# project with the pipeline migration applied — see supabase/schema.sql's
# "Pipeline architecture migration (2026-09-27)" section.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql src/lib/supabase.ts .env.example
git commit -m "feat: add pipeline_settings table and job_applications pipeline columns"
```

---

### Task 3: Vitest test runner setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `src/domain/pipeline/__tests__/setup.test.ts`

**Interfaces:** None — infrastructure only.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add the config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Add the `test` script**

In `package.json`'s `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write a trivial test to prove the runner works**

Create `src/domain/pipeline/__tests__/setup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: 1 test file, 1 test, PASS.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/domain/pipeline/__tests__/setup.test.ts
git commit -m "chore: add Vitest test runner"
```

---

### Task 4: Master-profile screening defaults

**Files:**
- Modify: `src/types/profile.ts`
- Modify: `src/domain/profile/master-profile.json`
- Modify: `src/domain/profile/index.ts`

**Interfaces:**
- Produces: `ScreeningDefaults` type and `getScreeningDefaults(): ScreeningDefaults` from `src/domain/profile/index.ts`, consumed by the tailoring stage in Task 9.

- [ ] **Step 1: Add the type**

In `src/types/profile.ts`, add after the `JobPreferences` interface:

```typescript
export interface ScreeningDefaults {
  workAuthorization: string; // e.g. "Authorized to work in Thailand, no sponsorship required"
  visaSponsorshipNeeded: boolean;
  noticePeriod: string; // e.g. "2 weeks"
  willingToRelocate: boolean;
}
```

And add it to `MasterProfile`:

```typescript
export interface MasterProfile {
  // ...existing fields...
  preferences: JobPreferences;
  screeningDefaults: ScreeningDefaults;
  syncedAt: string;
}
```

- [ ] **Step 2: Add real values to the JSON file**

Open `src/domain/profile/master-profile.json` and add a `screeningDefaults` object alongside the existing `preferences` key, with real values (not placeholders — these get sent to real employers):

```json
"screeningDefaults": {
  "workAuthorization": "Authorized to work in Thailand, no visa sponsorship required",
  "visaSponsorshipNeeded": false,
  "noticePeriod": "2 weeks",
  "willingToRelocate": false
}
```

(Adjust the actual values to be true — this is filled in from the real master profile owner's situation, not invented.)

- [ ] **Step 3: Add the accessor**

In `src/domain/profile/index.ts`, add:

```typescript
export function getScreeningDefaults(): ScreeningDefaults {
  return (masterProfileData as MasterProfile).screeningDefaults;
}
```

And add `ScreeningDefaults` to the import from `'@/types/profile'`.

- [ ] **Step 4: Verify the app still builds**

Run: `npm run build`
Expected: succeeds — this is a type/data addition with no consumers yet, so nothing should break.

- [ ] **Step 5: Commit**

```bash
git add src/types/profile.ts src/domain/profile/master-profile.json src/domain/profile/index.ts
git commit -m "feat: add screening-question defaults to master profile"
```

---

### Task 5: Migrate the job domain layer and `/api/jobs` route to Supabase

This replaces the `fs`-based `jobs.json` store with real Supabase rows, and adds Facebook-paste deduplication via a content hash.

**Files:**
- Modify: `src/types/job.ts`
- Modify: `src/domain/jobs/index.ts`
- Modify: `src/app/api/jobs/route.ts`
- Create: `src/domain/jobs/__tests__/dedup.test.ts`

**Interfaces:**
- Consumes: `getSupabaseClient()` from Task 2.
- Produces: `getAllJobs(): Promise<ScrapedJob[]>`, `getJobById(id: string): Promise<ScrapedJob | null>`, `createJobFromFacebookPaste(rawText: string, postUrl: string): Promise<ScrapedJob>`, `computeExternalId(rawText: string): string` from `src/domain/jobs/index.ts` — all consumed by later tasks.

- [ ] **Step 1: Extend the `ScrapedJob` type**

In `src/types/job.ts`, replace the file with:

```typescript
export type PipelineStage = 'new' | 'tailoring' | 'tailored' | 'sent' | 'error';

export interface ScrapedJob {
  id: string;
  source: 'facebook' | 'greenhouse' | 'ashby' | 'lever' | 'jobthai' | 'jobsdb' | 'manual';
  jobTitle: string;
  companyName: string;
  jobUrl: string;
  location: string;
  salaryRange?: string;
  jobDescription: string;
  requirements: string[];
  contactMethod?: {
    type: 'email' | 'line' | 'form' | 'messenger' | 'portal';
    value: string;
  };
  rawPostContent?: string;
  author?: string;
  postedAt?: string;
  matchScore?: number;
  createdAt: string;
  pipelineStage: PipelineStage;
  stageError?: string | null;
  externalId: string;
}

export interface FacebookScrapeRequest {
  postUrl?: string;
  rawText?: string;
}
```

- [ ] **Step 2: Write the failing dedup tests first**

Create `src/domain/jobs/__tests__/dedup.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('computeExternalId', () => {
  it('produces the same id for the same text', async () => {
    const { computeExternalId } = await import('../index');
    const text = 'Full Stack Developer needed, salary 40k THB, email hr@company.com';
    expect(computeExternalId(text)).toBe(computeExternalId(text));
  });

  it('produces different ids for different text', async () => {
    const { computeExternalId } = await import('../index');
    expect(computeExternalId('post A')).not.toBe(computeExternalId('post B'));
  });

  it('is insensitive to leading/trailing whitespace', async () => {
    const { computeExternalId } = await import('../index');
    expect(computeExternalId('  same post  ')).toBe(computeExternalId('same post'));
  });
});

describe('createJobFromFacebookPaste', () => {
  const mockFrom = vi.fn();

  vi.mock('@/lib/supabase', () => ({
    getSupabaseClient: () => ({ from: mockFrom }),
  }));

  function chainable(result: any) {
    const chain: any = {
      select: () => chain,
      insert: () => chain,
      eq: () => chain,
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
    };
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the existing row instead of inserting when the same text was already pasted', async () => {
    const { createJobFromFacebookPaste } = await import('../index');
    const existingRow = { id: 'existing-1', job_title: 'Backend Developer', company_name: 'Acme', pipeline_stage: 'new', external_id: 'whatever' };

    let insertCalled = false;
    mockFrom.mockReturnValue({
      ...chainable({ data: existingRow, error: null }),
      insert: () => {
        insertCalled = true;
        return chainable({ data: existingRow, error: null });
      },
    });

    const result = await createJobFromFacebookPaste('Same post text', 'https://facebook.com/post/1');

    expect(result.id).toBe('existing-1');
    expect(insertCalled).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/domain/jobs/__tests__/dedup.test.ts`
Expected: FAIL — `computeExternalId`/`createJobFromFacebookPaste` are not exported yet.

- [ ] **Step 4: Rewrite `src/domain/jobs/index.ts` onto Supabase**

Replace the entire file:

```typescript
import { createHash } from 'crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { ScrapedJob, PipelineStage } from '@/types/job';

const TABLE = 'job_applications';

export function computeExternalId(rawText: string): string {
  return createHash('sha256').update(rawText.trim()).digest('hex');
}

function rowToJob(row: any): ScrapedJob {
  return {
    id: row.id,
    source: row.source ?? 'manual',
    jobTitle: row.job_title,
    companyName: row.company_name,
    jobUrl: row.job_url ?? '',
    location: row.location ?? '',
    salaryRange: row.salary_range ?? undefined,
    jobDescription: row.job_description ?? '',
    requirements: row.requirements ?? [],
    contactMethod: row.contact_method_type
      ? { type: row.contact_method_type, value: row.contact_method_value }
      : undefined,
    rawPostContent: row.raw_post_content ?? undefined,
    author: row.author ?? undefined,
    matchScore: row.match_score ?? undefined,
    createdAt: row.created_at,
    pipelineStage: row.pipeline_stage as PipelineStage,
    stageError: row.stage_error,
    externalId: row.external_id,
  };
}

export async function getAllJobs(): Promise<ScrapedJob[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[JOBS_ERROR:list] ${error.message}`);
  return (data ?? []).map(rowToJob);
}

export async function getJobById(id: string): Promise<ScrapedJob | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();

  if (error) throw new Error(`[JOBS_ERROR:get] ${error.message}`);
  return data ? rowToJob(data) : null;
}

/**
 * Intelligent parser for Thai & English tech job posts (e.g. from Facebook Groups)
 * Extracts: Title, Company, Salary (THB), Tech Stack, HR Email, LINE ID, Form Link
 */
export function parseJobText(rawText: string, postUrl: string = ''): Partial<ScrapedJob> {
  const text = rawText.trim();

  const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
  const email = emailMatch ? emailMatch[1] : undefined;

  const lineMatch = text.match(/(?:line(?:\s*id)?|line:)\s*[:@]?\s*([a-zA-Z0-9._@-]+)/i);
  const lineId = lineMatch ? lineMatch[1] : undefined;

  const salaryMatch = text.match(/(?:salary|เงินเดือน|งบ|ค่าตอบแทน)?\s*[:]?\s*(?:฿|thb)?\s*(\d{1,3}(?:,\d{3})*(?:\s*-\s*\d{1,3}(?:,\d{3})*)?\s*(?:thb|บาท|k|\/month|\/เดือน)?)/i);
  let salaryRange: string | undefined;
  if (salaryMatch && salaryMatch[1] && salaryMatch[1].length > 3) {
    salaryRange = salaryMatch[1].trim();
    if (!salaryRange.toLowerCase().includes('บาท') && !salaryRange.toLowerCase().includes('thb')) {
      salaryRange = `฿${salaryRange}`;
    }
  }

  const techKeywords = [
    'React', 'Next.js', 'Nextjs', 'Vue', 'Angular', 'TypeScript', 'JavaScript', 'Node.js', 'Nodejs',
    'Express', 'NestJS', 'Nest.js', 'Python', 'FastAPI', 'Django', 'Golang', 'Go', 'PHP', 'Laravel',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Tailwind',
    'Flutter', 'React Native', 'Swift', 'Kotlin', 'Git', 'Prisma', 'GraphQL',
  ];
  const matchedStack: string[] = [];
  techKeywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');
    if (regex.test(text)) matchedStack.push(kw);
  });

  let jobTitle = 'Software Engineer';
  const titlePatterns = [
    /(?:position|ตำแหน่ง|รับสมัคร|หาคนทำ|looking for)?\s*[:]?\s*([A-Za-z0-9\s/]+(?:Developer|Engineer|Programmer|Frontend|Backend|Full\s*Stack|Data\s*Analyst|DevOps|QA))/i,
    /(Full\s*Stack\s*Developer|Frontend\s*Developer|Backend\s*Developer|Software\s*Engineer|React\s*Developer|Node\.js\s*Developer)/i,
  ];
  for (const pat of titlePatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      jobTitle = m[1].replace(/^(position|ตำแหน่ง|รับสมัคร|looking for)\s*[:]?/i, '').trim();
      break;
    }
  }

  let companyName = 'Thai Tech Employer';
  const companyMatch = text.match(/(?:company|บริษัท|บ\.)\s*[:]?\s*([^\n,]+)/i);
  if (companyMatch && companyMatch[1]) companyName = companyMatch[1].trim();

  let contactMethod: ScrapedJob['contactMethod'] = undefined;
  if (email) contactMethod = { type: 'email', value: email };
  else if (lineId) contactMethod = { type: 'line', value: lineId };
  else if (postUrl) contactMethod = { type: 'portal', value: postUrl };

  return {
    source: 'facebook',
    jobTitle,
    companyName,
    jobUrl: postUrl || 'https://facebook.com',
    location: text.toLowerCase().includes('remote') || text.includes('wfh') ? 'Bangkok, Thailand (Hybrid/Remote)' : 'Bangkok, Thailand',
    salaryRange: salaryRange || 'Negotiable (THB)',
    jobDescription: text.slice(0, 1500),
    requirements: matchedStack.length > 0 ? Array.from(new Set(matchedStack)) : ['TypeScript', 'React', 'Node.js'],
    contactMethod,
    rawPostContent: text,
  };
}

export async function createJobFromFacebookPaste(rawText: string, postUrl: string): Promise<ScrapedJob> {
  const supabase = getSupabaseClient();
  const externalId = computeExternalId(rawText);

  const existing = await supabase.from(TABLE).select('*').eq('external_id', externalId).maybeSingle();
  if (existing.data) return rowToJob(existing.data);

  const parsed = parseJobText(rawText, postUrl);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      source: 'facebook',
      job_title: parsed.jobTitle,
      company_name: parsed.companyName,
      job_url: parsed.jobUrl,
      location: parsed.location,
      salary_range: parsed.salaryRange,
      job_description: parsed.jobDescription,
      requirements: parsed.requirements,
      contact_method_type: parsed.contactMethod?.type ?? null,
      contact_method_value: parsed.contactMethod?.value ?? null,
      raw_post_content: parsed.rawPostContent,
      external_id: externalId,
      pipeline_stage: 'new',
    })
    .select()
    .single();

  if (error) throw new Error(`[JOBS_ERROR:create] ${error.message}`);
  return rowToJob(data);
}
```

- [ ] **Step 5: Run the dedup tests to verify they pass**

Run: `npx vitest run src/domain/jobs/__tests__/dedup.test.ts`
Expected: 4 tests, PASS.

- [ ] **Step 6: Update the `/api/jobs` route**

Replace `src/app/api/jobs/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getAllJobs, createJobFromFacebookPaste } from '@/domain/jobs';
import { advancePipeline } from '@/domain/pipeline/runStage';

export async function GET() {
  try {
    const jobs = await getAllJobs();
    return NextResponse.json({ success: true, jobs });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rawText, postUrl } = body;

    if (!rawText) {
      return NextResponse.json({ success: false, error: 'rawText is required' }, { status: 400 });
    }

    const job = await createJobFromFacebookPaste(rawText, postUrl || 'https://facebook.com');
    await advancePipeline(job.id);

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
```

(`advancePipeline` doesn't exist yet — it's built in Task 8. This route won't compile until then; that's expected and resolved within this same plan, not left broken at the end.)

- [ ] **Step 7: Commit**

```bash
git add src/types/job.ts src/domain/jobs/index.ts src/app/api/jobs/route.ts src/domain/jobs/__tests__/dedup.test.ts
git commit -m "feat: migrate job storage from local JSON to Supabase with paste dedup"
```

---

### Task 6: Pipeline settings module, API, and UI

**Files:**
- Create: `src/domain/pipeline/settings.ts`
- Create: `src/app/api/pipeline-settings/route.ts`
- Create: `src/components/pipeline/PipelineSettingsCard.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces: `getPipelineSettings(): Promise<PipelineSettings>`, `updatePipelineSettings(patch: Partial<PipelineSettings>): Promise<PipelineSettings>`, and the `PipelineSettings` type — consumed by the orchestrator in Task 8.

- [ ] **Step 1: Define the settings module**

Create `src/domain/pipeline/settings.ts`:

```typescript
import { getSupabaseClient } from '@/lib/supabase';

export interface PipelineSettings {
  autoIngestApiSources: boolean;
  autoTailor: boolean;
  maxDailyAutoTailor: number;
}

function rowToSettings(row: any): PipelineSettings {
  return {
    autoIngestApiSources: row.auto_ingest_api_sources,
    autoTailor: row.auto_tailor,
    maxDailyAutoTailor: row.max_daily_auto_tailor,
  };
}

export async function getPipelineSettings(): Promise<PipelineSettings> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('pipeline_settings').select('*').eq('id', 1).single();
  if (error) throw new Error(`[PIPELINE_SETTINGS_ERROR:get] ${error.message}`);
  return rowToSettings(data);
}

export async function updatePipelineSettings(patch: Partial<PipelineSettings>): Promise<PipelineSettings> {
  const supabase = getSupabaseClient();
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (patch.autoIngestApiSources !== undefined) update.auto_ingest_api_sources = patch.autoIngestApiSources;
  if (patch.autoTailor !== undefined) update.auto_tailor = patch.autoTailor;
  if (patch.maxDailyAutoTailor !== undefined) update.max_daily_auto_tailor = patch.maxDailyAutoTailor;

  const { data, error } = await supabase
    .from('pipeline_settings')
    .update(update)
    .eq('id', 1)
    .select()
    .single();

  if (error) throw new Error(`[PIPELINE_SETTINGS_ERROR:update] ${error.message}`);
  return rowToSettings(data);
}
```

- [ ] **Step 2: Add the API route**

Create `src/app/api/pipeline-settings/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getPipelineSettings, updatePipelineSettings } from '@/domain/pipeline/settings';

export async function GET() {
  try {
    const settings = await getPipelineSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const patch = await req.json();
    const settings = await updatePipelineSettings(patch);
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add the settings UI card**

Create `src/components/pipeline/PipelineSettingsCard.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import { PipelineSettings } from '@/domain/pipeline/settings';
import { Zap, ZapOff } from 'lucide-react';

interface PipelineSettingsCardProps {
  initialSettings: PipelineSettings;
}

export default function PipelineSettingsCard({ initialSettings }: PipelineSettingsCardProps) {
  const [settings, setSettings] = useState<PipelineSettings>(initialSettings);
  const [saving, setSaving] = useState(false);

  const toggleAutoTailor = async () => {
    setSaving(true);
    const next = !settings.autoTailor;
    try {
      const res = await fetch('/api/pipeline-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoTailor: next }),
      });
      const data = await res.json();
      if (data.success) setSettings(data.settings);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4">
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md flex items-center justify-between">
        <div>
          <p className="text-slate-200 font-medium">AI Tailoring</p>
          <p className="text-slate-500 text-sm">
            {settings.autoTailor
              ? `Auto-tailors every new job (up to ${settings.maxDailyAutoTailor}/day)`
              : 'Manual only — click "Tailor Now" per job'}
          </p>
        </div>
        <button
          onClick={toggleAutoTailor}
          disabled={saving}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition ${
            settings.autoTailor
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-slate-800/60 border-slate-700 text-slate-400'
          }`}
        >
          {settings.autoTailor ? <Zap size={16} /> : <ZapOff size={16} />}
          {settings.autoTailor ? 'Auto' : 'Manual'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire it into the homepage**

In `src/app/page.tsx`, add the import and render the card above `ProfileView`:

```typescript
import PipelineSettingsCard from '@/components/pipeline/PipelineSettingsCard';
import { getPipelineSettings } from '@/domain/pipeline/settings';
```

```tsx
export default async function HomePage() {
  const profile = getMasterProfile();
  const jobs = await getAllJobs();
  const pipelineSettings = await getPipelineSettings();

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
        <PipelineSettingsCard initialSettings={pipelineSettings} />
        <ProfileView initialProfile={profile} />
        <FacebookScraperCard initialJobs={jobs} />
      </div>
    </main>
  );
}
```

Note `HomePage` becomes `async` and `getAllJobs()` is now awaited (it's a Supabase call, not a sync `fs` read, per Task 5).

- [ ] **Step 5: Verify manually**

Run: `npm run dev`, open the homepage, confirm the "AI Tailoring: Manual" card renders, click it, confirm it flips to "Auto" and the change persists across a page refresh (i.e., it actually round-tripped through Supabase, not just local state).

- [ ] **Step 6: Commit**

```bash
git add src/domain/pipeline/settings.ts src/app/api/pipeline-settings/route.ts src/components/pipeline/PipelineSettingsCard.tsx src/app/page.tsx
git commit -m "feat: add pipeline settings toggle for AI tailoring"
```

---

### Task 7: Dedicated AI-battery API keys and dependency wiring

This task has manual, non-code steps (creating accounts/keys) that cannot be done by an automated worker — flag this to the human running the plan and wait for the keys before continuing.

**Files:**
- Modify: `package.json`
- Create: `src/lib/ai-tailor-client.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `generateTailoredContent(prompt: string): Promise<string>` from `src/lib/ai-tailor-client.ts`, consumed by the tailor stage in Task 9.

- [ ] **Step 1 (manual, human action required): Get job-hunting's own API keys**

1. Google Gemini: in Google Cloud Console, create a **new project** (e.g. `job-hunting-ai`) separate from any project used by `agent-second-brain` — Gemini's free-tier quota is per-project, not per-key, so reusing an existing project doesn't isolate quota. Enable the Generative Language API, generate an API key scoped to this new project.
2. Groq: create a key at console.groq.com, separate from `agent-second-brain`'s.
3. OpenRouter: create a key at openrouter.ai/keys, separate from `agent-second-brain`'s.
4. Cerebras: create a key at cloud.cerebras.ai, separate from `agent-second-brain`'s.
5. Add all four to `job-hunting`'s own `.env.local` (not `.env.example`, and never `agent-second-brain`'s `.env`):

```
GEMINI_API_KEY=<job-hunting's own key>
GROQ_API_KEY=<job-hunting's own key>
OPENROUTER_API_KEY=<job-hunting's own key>
CEREBRAS_API_KEY=<job-hunting's own key>
```

- [ ] **Step 2: Add the `file:` dependency**

In `package.json`'s `"dependencies"`, add:

```json
"@savewaris/ai-battery": "file:../../../agent-second-brain/packages/ai-battery"
```

Run: `npm install`

- [ ] **Step 3: Add the thin wrapper client**

Create `src/lib/ai-tailor-client.ts`:

```typescript
import { queryAiWithFallback } from '@savewaris/ai-battery';

export async function generateTailoredContent(prompt: string): Promise<string> {
  const response = await queryAiWithFallback(prompt, {
    temperature: 0.4,
    maxTokens: 1200,
  });
  return response.trim();
}
```

- [ ] **Step 4: Verify with a real live call, not a mock**

Run this one-off check against job-hunting's own `.env.local`:

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
require('ts-node/register');
" 2>/dev/null || node --experimental-vm-modules -e "
require('dotenv').config({ path: '.env.local' });
import('@savewaris/ai-battery').then(async ({ queryAiWithFallback }) => {
  const res = await queryAiWithFallback('Reply with exactly: JOB_HUNTING_AI_BATTERY_LIVE_OK');
  console.log('Response:', res.trim());
});
"
```

Expected: prints `Response: JOB_HUNTING_AI_BATTERY_LIVE_OK` — a real completion using job-hunting's own dedicated keys, proving the isolated key setup actually works before it's relied on by the tailoring stage. If any provider hits a quota error, that's expected occasionally (free tier) as long as the fallback still produces the response.

- [ ] **Step 5: Update `.env.example`**

Add a section documenting these are job-hunting's own dedicated keys, not shared:

```
# Dedicated to this project — do NOT reuse keys from agent-second-brain's .env.
# Gemini's free-tier quota is per Google Cloud PROJECT, so this needs its own
# project, not just a new key inside an existing one.
GEMINI_API_KEY=your-job-hunting-only-gemini-key
GROQ_API_KEY=your-job-hunting-only-groq-key
OPENROUTER_API_KEY=your-job-hunting-only-openrouter-key
CEREBRAS_API_KEY=your-job-hunting-only-cerebras-key
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/ai-tailor-client.ts .env.example
git commit -m "feat: wire up ai-battery for resume/cover-letter tailoring"
```

---

### Task 8: Pipeline orchestrator (`advancePipeline`)

This is the core state machine: the piece that decides whether a job auto-advances or waits for a human. It gets the most thorough tests in this plan because a bug here means a job either gets tailored when it shouldn't (burning AI quota against the user's wishes) or doesn't get tailored when it should.

**Files:**
- Create: `src/domain/pipeline/runStage.ts`
- Create: `src/domain/pipeline/__tests__/runStage.test.ts`

**Interfaces:**
- Consumes: `getJobById`, `getSupabaseClient` (Task 2/5), `getPipelineSettings` (Task 6), `tailorJob` (Task 9 — see note below).
- Produces: `advancePipeline(jobId: string): Promise<void>`, `runTailorNow(jobId: string): Promise<void>` — consumed by the `/api/jobs` route (Task 5) and a manual "Tailor Now" button (Task 9).

- [ ] **Step 1: Write the failing tests first**

Create `src/domain/pipeline/__tests__/runStage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetJobById = vi.fn();
const mockGetPipelineSettings = vi.fn();
const mockCountTailoredToday = vi.fn();
const mockTailorJob = vi.fn();
const mockMarkStageError = vi.fn();

vi.mock('@/domain/jobs', () => ({
  getJobById: (...args: any[]) => mockGetJobById(...args),
}));
vi.mock('@/domain/pipeline/settings', () => ({
  getPipelineSettings: (...args: any[]) => mockGetPipelineSettings(...args),
}));
vi.mock('@/domain/pipeline/tailorJob', () => ({
  tailorJob: (...args: any[]) => mockTailorJob(...args),
  countTailoredToday: (...args: any[]) => mockCountTailoredToday(...args),
}));

import { advancePipeline } from '../runStage';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('advancePipeline', () => {
  it('does nothing when the job is not at "new"', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'tailored' });
    await advancePipeline('job-1');
    expect(mockTailorJob).not.toHaveBeenCalled();
  });

  it('does not tailor when auto_tailor is off', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'new' });
    mockGetPipelineSettings.mockResolvedValue({ autoTailor: false, maxDailyAutoTailor: 20 });

    await advancePipeline('job-1');

    expect(mockTailorJob).not.toHaveBeenCalled();
  });

  it('tailors when auto_tailor is on and under the daily cap', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'new' });
    mockGetPipelineSettings.mockResolvedValue({ autoTailor: true, maxDailyAutoTailor: 20 });
    mockCountTailoredToday.mockResolvedValue(5);

    await advancePipeline('job-1');

    expect(mockTailorJob).toHaveBeenCalledWith('job-1');
  });

  it('does not tailor once the daily cap is reached', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'new' });
    mockGetPipelineSettings.mockResolvedValue({ autoTailor: true, maxDailyAutoTailor: 20 });
    mockCountTailoredToday.mockResolvedValue(20);

    await advancePipeline('job-1');

    expect(mockTailorJob).not.toHaveBeenCalled();
  });

  it('does not throw if tailorJob rejects — tailorJob itself owns error-state persistence', async () => {
    mockGetJobById.mockResolvedValue({ id: 'job-1', pipelineStage: 'new' });
    mockGetPipelineSettings.mockResolvedValue({ autoTailor: true, maxDailyAutoTailor: 20 });
    mockCountTailoredToday.mockResolvedValue(0);
    mockTailorJob.mockRejectedValue(new Error('all providers failed'));

    await expect(advancePipeline('job-1')).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify the tests fail**

Run: `npx vitest run src/domain/pipeline/__tests__/runStage.test.ts`
Expected: FAIL — `../runStage` doesn't exist yet.

- [ ] **Step 3: Implement `runStage.ts`**

Create `src/domain/pipeline/runStage.ts`:

```typescript
import { getJobById } from '@/domain/jobs';
import { getPipelineSettings } from '@/domain/pipeline/settings';
import { tailorJob, countTailoredToday } from '@/domain/pipeline/tailorJob';

export async function advancePipeline(jobId: string): Promise<void> {
  const job = await getJobById(jobId);
  if (!job || job.pipelineStage !== 'new') return;

  const settings = await getPipelineSettings();
  if (!settings.autoTailor) return;

  const countToday = await countTailoredToday();
  if (countToday >= settings.maxDailyAutoTailor) return;

  try {
    await tailorJob(jobId);
  } catch {
    // tailorJob is responsible for persisting pipeline_stage = 'error' itself
    // (see Task 9) — swallow here so a failed auto-tailor never crashes the
    // caller (e.g. the /api/jobs POST route that just successfully saved the job).
  }
}

export async function runTailorNow(jobId: string): Promise<void> {
  const job = await getJobById(jobId);
  if (!job || job.pipelineStage !== 'new') {
    throw new Error(`Job ${jobId} is not in a tailorable state (current stage: ${job?.pipelineStage})`);
  }
  await tailorJob(jobId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/pipeline/__tests__/runStage.test.ts`
Expected: 5 tests, PASS.

(This won't fully compile until Task 9 creates `tailorJob.ts` with the exported `tailorJob` and `countTailoredToday` — the mock in the test file stands in for it until then, so the test suite passes independently, but `npm run build` won't succeed until Task 9 is done. That's expected within this plan's task ordering.)

- [ ] **Step 5: Commit**

```bash
git add src/domain/pipeline/runStage.ts src/domain/pipeline/__tests__/runStage.test.ts
git commit -m "feat: add pipeline orchestrator with auto-tailor toggle and daily cap"
```

---

### Task 9: Tailor stage implementation

**Files:**
- Create: `src/domain/pipeline/tailorJob.ts`
- Create: `src/domain/pipeline/__tests__/tailorJob.test.ts`
- Create: `src/app/api/jobs/[id]/tailor/route.ts`

**Interfaces:**
- Consumes: `generateTailoredContent` (Task 7), `getSupabaseClient` (Task 2), `getMasterProfile`/`getScreeningDefaults` (Task 4).
- Produces: `tailorJob(jobId: string): Promise<void>`, `countTailoredToday(): Promise<number>` — consumed by `runStage.ts` (Task 8) and the manual tailor route.

- [ ] **Step 1: Write the failing tests first**

Create `src/domain/pipeline/__tests__/tailorJob.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockGenerateTailoredContent = vi.fn();
const mockGetMasterProfile = vi.fn();
const mockGetScreeningDefaults = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));
vi.mock('@/lib/ai-tailor-client', () => ({
  generateTailoredContent: (...args: any[]) => mockGenerateTailoredContent(...args),
}));
vi.mock('@/domain/profile', () => ({
  getMasterProfile: (...args: any[]) => mockGetMasterProfile(...args),
  getScreeningDefaults: (...args: any[]) => mockGetScreeningDefaults(...args),
}));

import { tailorJob } from '../tailorJob';

function makeJobRow(overrides: Record<string, any> = {}) {
  return {
    id: 'job-1',
    job_title: 'Backend Developer',
    company_name: 'Acme Co',
    job_description: 'Build APIs',
    requirements: ['Node.js'],
    contact_method_type: 'email',
    contact_method_value: 'hr@acme.co',
    ...overrides,
  };
}

function chainable(result: any) {
  const chain: any = {
    select: () => chain,
    update: () => chain,
    insert: () => chain,
    eq: () => chain,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMasterProfile.mockReturnValue({ skills: ['Node.js'], experiences: [] });
  mockGetScreeningDefaults.mockReturnValue({ workAuthorization: 'Authorized', visaSponsorshipNeeded: false, noticePeriod: '2 weeks', willingToRelocate: false });
  mockGenerateTailoredContent.mockResolvedValue('Tailored resume bullets and cover letter text.');
});

describe('tailorJob', () => {
  it('creates a cold_emails draft when the job has an email contact', async () => {
    const jobRow = makeJobRow();
    const insertedTables: string[] = [];

    mockFrom.mockImplementation((table: string) => {
      insertedTables.push(table);
      if (table === 'job_applications') return chainable({ data: jobRow, error: null });
      return chainable({ data: { id: 'doc-1' }, error: null });
    });

    await tailorJob('job-1');

    expect(insertedTables).toContain('cold_emails');
  });

  it('does not create a cold_emails draft when the job has no email contact', async () => {
    const jobRow = makeJobRow({ contact_method_type: 'line', contact_method_value: 'somelineid' });
    const insertedTables: string[] = [];

    mockFrom.mockImplementation((table: string) => {
      insertedTables.push(table);
      if (table === 'job_applications') return chainable({ data: jobRow, error: null });
      return chainable({ data: { id: 'doc-1' }, error: null });
    });

    await tailorJob('job-1');

    expect(insertedTables).not.toContain('cold_emails');
  });

  it('marks the job as errored if every AI provider fails, and does not throw', async () => {
    const jobRow = makeJobRow();
    mockFrom.mockImplementation((table: string) => chainable({ data: jobRow, error: null }));
    mockGenerateTailoredContent.mockRejectedValue(new Error('All free-tier models in the 24/7 battery exhausted.'));

    await expect(tailorJob('job-1')).rejects.toThrow();
    // the caller (advancePipeline) is what swallows this — tailorJob itself
    // is expected to persist the error state before rethrowing, tested via
    // the mockFrom call arguments below.
    const updateCalls = mockFrom.mock.calls.filter(([table]) => table === 'job_applications');
    expect(updateCalls.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify the tests fail**

Run: `npx vitest run src/domain/pipeline/__tests__/tailorJob.test.ts`
Expected: FAIL — `../tailorJob` doesn't exist yet.

- [ ] **Step 3: Implement `tailorJob.ts`**

Create `src/domain/pipeline/tailorJob.ts`:

```typescript
import { getSupabaseClient } from '@/lib/supabase';
import { generateTailoredContent } from '@/lib/ai-tailor-client';
import { getMasterProfile, getScreeningDefaults } from '@/domain/profile';

export async function countTailoredToday(): Promise<number> {
  const supabase = getSupabaseClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('job_applications')
    .select('id', { count: 'exact', head: true })
    .gte('tailored_at', startOfDay.toISOString());

  if (error) throw new Error(`[TAILOR_ERROR:count] ${error.message}`);
  return count ?? 0;
}

function buildPrompt(job: any): string {
  const profile = getMasterProfile();
  const screening = getScreeningDefaults();

  return `You are tailoring a job application for this candidate:
Skills: ${profile.skills.join(', ')}
Work authorization: ${screening.workAuthorization}
Notice period: ${screening.noticePeriod}

Job: ${job.job_title} at ${job.company_name}
Description: ${job.job_description}
Requirements: ${(job.requirements ?? []).join(', ')}

Write two things, clearly separated by "---COVER LETTER---":
1. A short list of 3-5 tailored resume bullet points highlighting the candidate's most relevant experience for this specific job.
2. A concise, personalized cold-email cover letter (150-200 words) for this specific job.`;
}

export async function tailorJob(jobId: string): Promise<void> {
  const supabase = getSupabaseClient();

  await supabase
    .from('job_applications')
    .update({ pipeline_stage: 'tailoring', tailored_at: new Date().toISOString() })
    .eq('id', jobId);

  const { data: job, error: fetchError } = await supabase
    .from('job_applications')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !job) {
    throw new Error(`[TAILOR_ERROR:fetch] ${fetchError?.message ?? 'job not found'}`);
  }

  try {
    const content = await generateTailoredContent(buildPrompt(job));
    const [bullets, coverLetter] = content.split('---COVER LETTER---').map(s => s.trim());

    await supabase.from('tailored_documents').insert({
      job_application_id: jobId,
      doc_type: 'resume',
      content: bullets || content,
    });

    if (job.contact_method_type === 'email' && job.contact_method_value) {
      await supabase.from('cold_emails').insert({
        job_application_id: jobId,
        company_name: job.company_name,
        job_title: job.job_title,
        recipient_email: job.contact_method_value,
        subject: `Application: ${job.job_title} at ${job.company_name}`,
        body: coverLetter || content,
        status: 'draft',
        tailored_summary: bullets || content,
      });
    }

    await supabase.from('job_applications').update({ pipeline_stage: 'tailored' }).eq('id', jobId);
  } catch (err: any) {
    await supabase
      .from('job_applications')
      .update({ pipeline_stage: 'error', stage_error: err.message })
      .eq('id', jobId);
    throw err;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/pipeline/__tests__/tailorJob.test.ts`
Expected: 3 tests, PASS.

- [ ] **Step 5: Add the manual "Tailor Now" route**

Create `src/app/api/jobs/[id]/tailor/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { runTailorNow } from '@/domain/pipeline/runStage';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await runTailorNow(params.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Run the full test suite and the build**

Run: `npm test`
Expected: all test files (setup, dedup, runStage, tailorJob) PASS.

Run: `npm run build`
Expected: succeeds — this is the task where `runStage.ts`'s import of `tailorJob`/`countTailoredToday` finally resolves to a real file.

- [ ] **Step 7: Commit**

```bash
git add src/domain/pipeline/tailorJob.ts src/domain/pipeline/__tests__/tailorJob.test.ts src/app/api/jobs/[id]/tailor/route.ts
git commit -m "feat: implement AI tailoring stage with cold-email draft creation"
```

---

### Task 10: On-demand PDF generation

**Files:**
- Create: `src/lib/pdf/ResumeDocument.tsx`
- Create: `src/lib/pdf/generateResumePdf.ts`
- Create: `src/app/api/tailored-documents/[id]/pdf/route.ts`

**Interfaces:**
- Consumes: `tailored_documents` rows (Task 9), `getMasterProfile`/`getCandidateContact` (existing, Task 4's file).
- Produces: `generateResumePdf(profile, tailoredBullets): Promise<Buffer>` from `src/lib/pdf/generateResumePdf.ts`, consumed by Task 12's send route (kept as one shared implementation instead of duplicating the render call). A `GET` route returning `application/pdf`, consumed by the cold-email review UI (Task 11) as a preview link.

- [ ] **Step 1: Write the PDF document component**

Create `src/lib/pdf/ResumeDocument.tsx`:

```tsx
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { MasterProfile } from '@/types/profile';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  header: { marginBottom: 16 },
  name: { fontSize: 20, fontWeight: 700 },
  contact: { fontSize: 10, color: '#555', marginTop: 4 },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
  bullet: { marginBottom: 2 },
});

interface ResumeDocumentProps {
  profile: MasterProfile;
  tailoredBullets: string;
}

export default function ResumeDocument({ profile, tailoredBullets }: ResumeDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{profile.fullName}</Text>
          <Text style={styles.contact}>{profile.email} • {profile.phone} • {profile.location}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text>{profile.summary}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tailored Highlights</Text>
          {tailoredBullets.split('\n').filter(Boolean).map((line, i) => (
            <Text key={i} style={styles.bullet}>{line.replace(/^[-*]\s*/, '• ')}</Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Experience</Text>
          {profile.experiences.map((exp, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              <Text style={{ fontWeight: 700 }}>{exp.role} — {exp.company}</Text>
              <Text>{exp.description}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Add a shared PDF-rendering helper**

This is used by both the preview route below and the send route in Task 12 — written once here so neither task duplicates the `renderToBuffer`/`React.createElement` call.

Create `src/lib/pdf/generateResumePdf.ts`:

```typescript
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import ResumeDocument from './ResumeDocument';
import { MasterProfile } from '@/types/profile';

export async function generateResumePdf(profile: MasterProfile, tailoredBullets: string): Promise<Buffer> {
  return renderToBuffer(React.createElement(ResumeDocument, { profile, tailoredBullets }));
}
```

- [ ] **Step 3: Add the on-demand route**

Create `src/app/api/tailored-documents/[id]/pdf/route.ts`:

```typescript
import { getSupabaseClient } from '@/lib/supabase';
import { getMasterProfile } from '@/domain/profile';
import { generateResumePdf } from '@/lib/pdf/generateResumePdf';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseClient();
  const { data: doc, error } = await supabase
    .from('tailored_documents')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !doc) {
    return new Response('Tailored document not found', { status: 404 });
  }

  const profile = getMasterProfile();
  const buffer = await generateResumePdf(profile, doc.content);

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="resume-${params.id}.pdf"`,
    },
  });
}
```

- [ ] **Step 4: Verify manually with a real render**

After Task 9 has produced at least one `tailored_documents` row (paste a real job with `auto_tailor` on, or use the manual Tailor Now route), run:

```bash
curl -s -o /tmp/test-resume.pdf -w "HTTP %{http_code}, %{size_download} bytes\n" http://localhost:3000/api/tailored-documents/<real-doc-id>/pdf
```

Expected: `HTTP 200` and a non-trivial byte count (a few KB, not 0) — open `/tmp/test-resume.pdf` to confirm it's a real, readable PDF, not just a 200 status with empty content.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/ResumeDocument.tsx src/lib/pdf/generateResumePdf.ts src/app/api/tailored-documents/[id]/pdf/route.ts
git commit -m "feat: render tailored resume PDFs on demand"
```

---

### Task 11: Cold-email review queue UI

**Files:**
- Create: `src/domain/cold-emails/index.ts`
- Create: `src/app/api/cold-emails/route.ts`
- Create: `src/app/api/cold-emails/[id]/route.ts`
- Create: `src/components/cold-emails/ColdEmailQueue.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces: `getDraftColdEmails(): Promise<ColdEmail[]>`, `updateColdEmail(id: string, patch: Partial<ColdEmail>): Promise<ColdEmail>` — consumed by the send route in Task 12.

- [ ] **Step 1: Add the domain module**

Create `src/domain/cold-emails/index.ts`:

```typescript
import { getSupabaseClient } from '@/lib/supabase';

export interface ColdEmail {
  id: string;
  jobApplicationId: string;
  companyName: string;
  jobTitle: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: 'draft' | 'reviewed' | 'sent';
  tailoredSummary: string | null;
}

function rowToEmail(row: any): ColdEmail {
  return {
    id: row.id,
    jobApplicationId: row.job_application_id,
    companyName: row.company_name,
    jobTitle: row.job_title,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    body: row.body,
    status: row.status,
    tailoredSummary: row.tailored_summary,
  };
}

export async function getDraftColdEmails(): Promise<ColdEmail[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('cold_emails')
    .select('*')
    .neq('status', 'sent')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[COLD_EMAIL_ERROR:list] ${error.message}`);
  return (data ?? []).map(rowToEmail);
}

export async function getColdEmailById(id: string): Promise<ColdEmail | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('cold_emails').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`[COLD_EMAIL_ERROR:get] ${error.message}`);
  return data ? rowToEmail(data) : null;
}

export async function updateColdEmail(id: string, patch: { subject?: string; body?: string; status?: ColdEmail['status'] }): Promise<ColdEmail> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('cold_emails').update(patch).eq('id', id).select().single();
  if (error) throw new Error(`[COLD_EMAIL_ERROR:update] ${error.message}`);
  return rowToEmail(data);
}
```

- [ ] **Step 2: Add the list/update API routes**

Create `src/app/api/cold-emails/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getDraftColdEmails } from '@/domain/cold-emails';

export async function GET() {
  try {
    const emails = await getDraftColdEmails();
    return NextResponse.json({ success: true, emails });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
```

Create `src/app/api/cold-emails/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { updateColdEmail } from '@/domain/cold-emails';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const patch = await req.json();
    const email = await updateColdEmail(params.id, patch);
    return NextResponse.json({ success: true, email });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Build the review queue UI**

Create `src/components/cold-emails/ColdEmailQueue.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import { ColdEmail } from '@/domain/cold-emails';
import { Send, FileText, Check } from 'lucide-react';

interface ColdEmailQueueProps {
  initialEmails: ColdEmail[];
}

export default function ColdEmailQueue({ initialEmails }: ColdEmailQueueProps) {
  const [emails, setEmails] = useState<ColdEmail[]>(initialEmails);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const updateField = (id: string, field: 'subject' | 'body', value: string) => {
    setEmails(prev => prev.map(e => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const saveEdit = async (email: ColdEmail) => {
    await fetch(`/api/cold-emails/${email.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: email.subject, body: email.body }),
    });
  };

  const handleSend = async (id: string) => {
    setSendingId(id);
    try {
      const res = await fetch(`/api/cold-emails/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setEmails(prev => prev.filter(e => e.id !== id));
      }
    } finally {
      setSendingId(null);
    }
  };

  if (emails.length === 0) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 text-slate-500 text-center">
          No cold-email drafts waiting for review.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-4">
      {emails.map(email => (
        <div key={email.id} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-slate-200 font-medium">{email.jobTitle} @ {email.companyName}</p>
            <a
              href={`/api/tailored-documents/${email.jobApplicationId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-slate-400 text-sm hover:text-slate-200"
            >
              <FileText size={14} /> Preview PDF
            </a>
          </div>
          <input
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-sm"
            value={email.subject}
            onChange={e => updateField(email.id, 'subject', e.target.value)}
            onBlur={() => saveEdit(email)}
          />
          <textarea
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-sm min-h-[140px]"
            value={email.body}
            onChange={e => updateField(email.id, 'body', e.target.value)}
            onBlur={() => saveEdit(email)}
          />
          <div className="flex justify-end">
            <button
              onClick={() => handleSend(email.id)}
              disabled={sendingId === email.id}
              className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 px-4 py-2 rounded-xl"
            >
              {sendingId === email.id ? <Check size={16} /> : <Send size={16} />}
              {sendingId === email.id ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into the homepage**

In `src/app/page.tsx`, add:

```typescript
import ColdEmailQueue from '@/components/cold-emails/ColdEmailQueue';
import { getDraftColdEmails } from '@/domain/cold-emails';
```

```tsx
const draftEmails = await getDraftColdEmails();
// ...
<ColdEmailQueue initialEmails={draftEmails} />
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`, tailor a real job (Task 9's manual route or auto-tailor), confirm its cold-email draft appears in the queue, edit the subject/body, refresh the page, confirm the edit persisted (round-tripped through Supabase via the `onBlur` PATCH, not just local state).

- [ ] **Step 6: Commit**

```bash
git add src/domain/cold-emails src/app/api/cold-emails src/components/cold-emails/ColdEmailQueue.tsx src/app/page.tsx
git commit -m "feat: add cold-email review queue with editable drafts"
```

---

### Task 12: Real email sending

**Files:**
- Create: `src/lib/mailer.ts`
- Create: `src/app/api/cold-emails/[id]/send/route.ts`

**Interfaces:**
- Consumes: `getColdEmailById`/`updateColdEmail` (Task 11), `generateResumePdf` (Task 10, shared PDF helper — not the PDF route itself, to avoid an HTTP round-trip to its own app for something it can call directly).
- Produces: nothing further consumed — this is the terminal action of the pipeline.

- [ ] **Step 1: Add the mailer**

Create `src/lib/mailer.ts`:

```typescript
import nodemailer from 'nodemailer';

export function getMailer() {
  const service = process.env.EMAIL_SERVICE;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;

  if (!service || !user || !pass) {
    throw new Error('Missing EMAIL_SERVICE, EMAIL_USER, or EMAIL_APP_PASSWORD in the environment.');
  }

  return nodemailer.createTransport({ service, auth: { user, pass } });
}

export async function sendColdEmail(opts: {
  to: string;
  subject: string;
  body: string;
  attachmentBuffer: Buffer;
  attachmentFilename: string;
}) {
  const transporter = getMailer();
  const fromName = process.env.EMAIL_FROM_NAME || 'Job Applicant';

  return transporter.sendMail({
    from: `"${fromName}" <${process.env.EMAIL_USER}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    attachments: [{ filename: opts.attachmentFilename, content: opts.attachmentBuffer }],
  });
}
```

- [ ] **Step 2: Add the send route**

Create `src/app/api/cold-emails/[id]/send/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getColdEmailById, updateColdEmail } from '@/domain/cold-emails';
import { getMasterProfile } from '@/domain/profile';
import { generateResumePdf } from '@/lib/pdf/generateResumePdf';
import { sendColdEmail } from '@/lib/mailer';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const email = await getColdEmailById(params.id);
    if (!email) {
      return NextResponse.json({ success: false, error: 'Cold email not found' }, { status: 404 });
    }

    const supabase = getSupabaseClient();
    const { data: doc } = await supabase
      .from('tailored_documents')
      .select('*')
      .eq('job_application_id', email.jobApplicationId)
      .eq('doc_type', 'resume')
      .single();

    const profile = getMasterProfile();
    const pdfBuffer = await generateResumePdf(profile, doc?.content ?? '');

    await sendColdEmail({
      to: email.recipientEmail,
      subject: email.subject,
      body: email.body,
      attachmentBuffer: pdfBuffer,
      attachmentFilename: `${profile.fullName.replace(/\s+/g, '_')}_Resume.pdf`,
    });

    await updateColdEmail(email.id, { status: 'sent' });
    await supabase
      .from('job_applications')
      .update({ pipeline_stage: 'sent', status: 'applied' })
      .eq('id', email.jobApplicationId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify with a real send to yourself**

Set `EMAIL_USER`/`EMAIL_APP_PASSWORD`/`EMAIL_SERVICE`/`EMAIL_FROM_NAME` in `.env.local` (per the existing `.env.example` instructions for a Gmail app password). Tailor a real test job with your own email as the contact method, open the review queue, click Send, and **check your real inbox** for the email with the PDF attachment — this is the one step in the whole pipeline that must be verified by looking at a real inbox, not by a 200 response, since a 200 from `nodemailer` doesn't guarantee real delivery (e.g. it could still bounce).

- [ ] **Step 4: Commit**

```bash
git add src/lib/mailer.ts src/app/api/cold-emails/[id]/send/route.ts
git commit -m "feat: send tailored cold emails with PDF resume attachment"
```

---

### Task 13: End-to-end verification

No new code — this task exists to prove the whole slice works together on a real job, per the spec's own §8 requirement that Phase A be "manually verified working end-to-end on at least one real job" before anything else is built on top of it.

**Files:** None.

**Interfaces:** None.

- [ ] **Step 1: Run the full automated suite one more time**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 2: Walk one real job through the entire pipeline, by hand, watching Supabase**

1. With `auto_tailor` OFF, paste a real Facebook job post (with your own email as the contact, for a safe test) into the app.
2. Confirm in Supabase's table editor that a new `job_applications` row appeared with `pipeline_stage = 'new'`.
3. Click "Tailor Now". Confirm the row moves to `pipeline_stage = 'tailored'`, a `tailored_documents` row exists, and a `cold_emails` row exists with `status = 'draft'`.
4. Open the review queue, confirm the draft renders, preview the PDF link and confirm it's a real, readable PDF.
5. Edit the email body, refresh the page, confirm the edit persisted.
6. Click Send. Confirm the real email arrives in your inbox with the PDF attached, and that Supabase now shows `cold_emails.status = 'sent'`, `job_applications.pipeline_stage = 'sent'`, `job_applications.status = 'applied'`.
7. Flip `auto_tailor` ON via the settings card, paste a second real post, and confirm it reaches `tailored` **without** clicking "Tailor Now" — proving the toggle-chaining actually works live, not just in the mocked unit tests.

Expected: every step above matches, using real data you can see in Supabase and a real email you can see in your inbox — not a claimed pass.

- [ ] **Step 3: Report the real evidence**

Report back with what was actually observed at each numbered step above (screenshots or copy-pasted Supabase row contents are ideal) — this is the same "show real evidence" standard the pipeline architecture design itself was verified against.
