# Job-Hunting Pipeline Architecture — Design Spec

**Status:** Draft — pending user review
**Date:** 2026-09-27
**Related:** `second-brain/Decisions/Job-Hunting Automation Tool Choices.md` (external tool/platform decisions — runtime target, email library, PDF library, source legality); this spec covers the parts that decision doc doesn't: pipeline shape, data model, and the new browser-agent auto-apply subsystem.

## 1. Context

The `savewaris/job-hunting` project's `56b955c` "clean slate rebuild" (2026-09-13) deleted most of what an earlier decision record calls "Plan 1, already complete" — the cold-email queue, AI resume/cover-letter tailoring, PDF generation, Kanban tracker, offer calculator, interview calendar, analytics dashboard, and all Supabase wiring — leaving only a profile view and a Facebook scraper. That new scraper also contradicted an earlier decision by autonomously logging into Facebook and scrolling the feed, instead of the decided bookmarklet/manual approach.

Both were caught and resolved through a `/grill-me` interview (see the decision doc's 2026-09-27 update) before this spec was written. Separately, the user identified that the project "didn't have proper architecture" — persistence was ad-hoc `fs`-based JSON files with no queryable relational state, duplicated parsing logic between the API route and the CLI script, and no mechanism for incrementally trusting automation (everything was either fully manual or fully scripted, with nothing in between).

This spec designs that missing architecture: a staged pipeline with per-stage automation toggles, backed by the Supabase schema that already exists but was never wired up, plus a new AI-driven browser-agent subsystem for applying directly to ATS-hosted job postings.

## 2. Goals

- A job's progress through the system (ingested → tailored → applied/sent) is explicit, persisted, queryable state — not implicit in which script last touched a JSON file.
- Every autonomous action (pulling from an external API, spending an AI call, submitting a real application) is gated by an explicit, named, global on/off setting the user controls, defaulting to OFF, so each can be verified manually before being trusted to run unattended.
- Reuse existing, verified building blocks rather than rebuilding them: the existing `supabase/schema.sql`, the existing `@savewaris/ai-battery` package (live-verified against all four configured providers as part of this design session — see §6), and Stagehand for AI-driven browser control rather than a custom vision-loop agent.
- Two genuinely different "delivery" paths coexist depending on how a job accepts applicants: cold email (for jobs with only a contact email, e.g. most Facebook posts) and direct ATS form submission (for jobs sourced from Greenhouse/Lever/Ashby with their own Apply page).

## 3. Non-Goals

- No automation of Facebook itself. Confirmed twice in this design process (once before this spec, once again when browser-agent capability was introduced): Facebook sourcing stays a human pasting post text into the existing `/api/jobs` route. No login script, no persistent session, no scheduled scanning.
- No automation of LinkedIn. Already excluded — no public jobs-search API exists, and its ToS explicitly prohibits automated access.
- No CAPTCHA/anti-bot circumvention. If the ATS auto-apply agent (§7) encounters a CAPTCHA or other bot-challenge on a company's site, it stops and surfaces an error. It does not attempt to solve or bypass it.
- No multi-user support / auth. This remains a single-user personal tool, matching the existing schema's documented "permissive RLS" trade-off.
- No cross-source deduplication. If the same real-world job appears both as a pasted Facebook post and a scraped Greenhouse listing, both are kept as separate `job_applications` rows (dedup only catches exact repeats *within* one source, via `external_id`). Acceptable for v1 volume; revisit only if duplicate noise actually becomes a problem in practice.
- No automatic re-tailoring on profile edits. Editing `MasterProfile` never silently changes AI-generated content already produced for a specific job — a job sitting in `tailored` (reviewed or not) keeps its content until the user explicitly clicks a "Re-tailor" action. This protects against overwriting hand-edits made in the review queue.

## 4. Locked decisions this design builds on

(Full reasoning and research citations live in the decision doc referenced above; restated briefly here since the architecture depends on them.)

- Runtime: a persistent local/VPS Node process with its own cron/scheduler — not Vercel serverless.
- Email: `nodemailer` + a personal Gmail/Outlook app password.
- PDF: `@react-pdf/renderer`, rendered on demand from stored tailored content — never persisted as a file.
- Sources: Greenhouse, Lever, Ashby (public ATS APIs), JobThai (public GraphQL), JobsDB Thailand (public REST — endpoint verified live during this session, `HTTP 200` with real listings from `th.jobsdb.com/api/jobsearch/v5/search`). LinkedIn excluded.
- Persistence: Supabase, using the existing `supabase/schema.sql` as the foundation, extended (§5.2) rather than replaced.
- Security posture: the existing schema's permissive `USING (true)` RLS (no real auth, anon key is already client-exposed via `NEXT_PUBLIC_*`) was an accepted trade-off for a single-user tool. This design re-affirms it consciously rather than carrying it forward silently, even though the data behind it now also includes `ats_applications.screening_answers` (e.g. visa/work-authorization status) and cold-email content — still a single-user tool, so the trade-off's underlying logic is unchanged, but the stakes of that data leaking are higher than when the decision was first made.

## 5. Phase A — Core Pipeline (build first)

### 5.1 Stages and toggles

A job_application row moves through:

```
new --[auto_tailor?]--> tailoring --> tailored --+--[email contact]----> (cold_emails draft) --[always manual]--> sent
                                                  +--[form/portal URL]--> applying --[auto_submit_application?]--> awaiting_confirmation --[manual OR auto]--> sent
any stage --[on failure]--> error (manual retry, no silent auto-retry loop)
```

Three global toggles, stored in a new singleton `pipeline_settings` table, each defaulting to `false`:

| Toggle | Gates | Why it's a toggle |
|---|---|---|
| `auto_ingest_api_sources` | Whether the scheduled Greenhouse/Lever/Ashby/JobThai/JobsDB pull runs unattended | Real network calls to third parties, worth verifying manually first |
| `auto_tailor` | Whether AI tailoring (resume rewrite + cover-letter/cold-email draft) runs immediately after ingest | Costs an AI-battery call and makes a content-quality judgment call |
| `auto_submit_application` | Whether the ATS browser agent (§7) proceeds straight to clicking Submit, vs. stopping for manual confirmation | Submitting a real application is consequential and hard to undo. This was raised twice for reconsideration — once against the cold-email hard-gate precedent, once against a real competitor (RoleWorth) that keeps this exact step non-skippable even as a paid feature — and reaffirmed toggleable both times. This is a deliberate, informed choice, not an oversight. |

PDF rendering and cold-email-draft creation are **not** separate toggles — they're deterministic side effects of tailoring succeeding, with no judgment call to gate. Cold-email **send** itself has no toggle at all; it is always a manual click, regardless of any other setting (this was decided independently of the toggle system and stays that way).

**Volume safeguard, separate from the quality decision above:** the user separately decided every ingested job gets tailored regardless of match quality (§ earlier decision, unchanged). But with `auto_ingest_api_sources` and `auto_tailor` both on, a single busy ingestion day could exhaust the free-tier AI budget by mid-morning — Cerebras has a hard 200 requests/day cap, and this session's own live testing showed Gemini's project-level quota exhausting under light load. `pipeline_settings` gets a fourth field, `max_daily_auto_tailor` (integer, default 20), capping how many jobs `auto_tailor` will chain through per day; once hit, remaining `new` jobs wait for either the next day's reset or a manual "Tailor Now" click. This caps *volume*, not *quality* — it doesn't reintroduce the match-scoring gate that was explicitly rejected earlier.

### 5.2 Data model changes

Extends `supabase/schema.sql` in place:

```sql
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'new',
    -- new, tailoring, tailored, applying, awaiting_confirmation, sent, error
  ADD COLUMN IF NOT EXISTS stage_error TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
    -- facebook, greenhouse, lever, ashby, jobthai, jobsdb, manual
  ADD COLUMN IF NOT EXISTS external_id TEXT;
    -- dedup key: canonical job_url for API sources, content-hash of rawPostContent for pasted Facebook text

CREATE UNIQUE INDEX IF NOT EXISTS job_applications_external_id_idx
  ON public.job_applications (external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pipeline_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton row, single-user tool
  auto_ingest_api_sources BOOLEAN NOT NULL DEFAULT false,
  auto_tailor BOOLEAN NOT NULL DEFAULT false,
  auto_submit_application BOOLEAN NOT NULL DEFAULT false,
  max_daily_auto_tailor INTEGER NOT NULL DEFAULT 20,
  max_daily_auto_apply INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.pipeline_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
```

`master_profiles`, `tailored_documents`, and `cold_emails` already exist and need no schema changes. `cold_emails` (status `draft`/`reviewed`/`sent`) *is* the cold-email review queue — a `draft` row is created automatically the moment tailoring succeeds for a job whose only contact method is an email address. Its `subject`/`body` are editable text in the review UI before Send, not just an approve-or-reject choice — the review gate exists so the user can fix the AI's output, not only accept or discard it wholesale; the same editability applies to the ATS agent's `filled_fields`/`screening_answers` before Confirm & Submit (§7.6).

`job_applications.status` (`wishlist`/`applied`/`interviewing`/`offer`/`rejected`) is untouched — it's the human-owned post-engagement Kanban tracking, orthogonal to `pipeline_stage`, which is system-owned automation progress. When `pipeline_stage` reaches `sent`, `status` auto-advances to `applied` as a convenience default, but remains manually editable afterward. This same `status` field doubles as the "I don't want to pursue this" path *before* send too — setting it to `rejected` at any point (including while a job still sits at `tailored`) is how the user dismisses a job without deleting it; no separate pipeline-level "skip" state is needed.

`ats_applications` is a new table, the ATS-apply-branch equivalent of `cold_emails` — see §7.2.

### 5.3 Orchestration

A single shared module, `src/domain/pipeline/`, with one function per stage (`tailorJob`, `queueColdEmail`, `startApplyAgent`, etc.), called from both:
- Next.js API routes, for interactive actions (pasting a Facebook post, clicking "Tailor Now" manually, clicking "Send").
- A new scheduled script, `scripts/ingest-scheduled.mjs`, cron'd every 4-6 hours on the same persistent Node process already committed to for `nodemailer`/scheduling reasons — frequent enough to surface same-day postings without hammering public APIs that don't refresh any faster than this in practice.

After each stage completes, an orchestrator function checks the relevant `pipeline_settings` flag: if the next stage is auto-enabled, it chains immediately (same process, same call stack, no polling delay); if not, it stops and the job sits in a state the UI surfaces with a manual "run this stage" action. This is one code path regardless of whether the job arrived via an interactive paste or an unattended scheduled pull — the only difference is what fired the first `runStage` call.

Errors stop the chain and set `pipeline_stage = 'error'` with `stage_error` populated. No automatic retry — retrying is a manual action, to avoid hammering a rate-limited API or resubmitting a broken form-fill in a loop.

**Observability:** `scripts/ingest-scheduled.mjs` runs unattended on a cron schedule with no browser tab open to watch it, so a silent crash or a stuck run would otherwise go unnoticed. It posts a run summary (jobs found, jobs skipped as duplicates, errors) to the same Discord webhook already used elsewhere in this user's automation ecosystem for progress/CI alerts — reusing an existing channel rather than adding a new notification mechanism.

### 5.4 AI Tailoring — dependency and keys

- `@savewaris/ai-battery` is added as a `file:` dependency (`"@savewaris/ai-battery": "file:../../../agent-second-brain/packages/ai-battery"`), not vendored or installed from GitHub. This was a deliberate choice given the package only exists locally on this machine right now: real reuse with zero duplicated logic, accepting that the build only works with `agent-second-brain` cloned at that relative path.
- **Verified live during this design session**, not assumed: running the package's own CLI test (`node packages/ai-battery/index.mjs`) showed two Gemini models genuinely hit real `429` quota-exhaustion errors from Google's API, and the dispatcher correctly rotated to a working model. Separately isolating OpenRouter and Cerebras (via the package's documented `candidateChain` override) confirmed both return real completions independently. All four configured providers (Gemini, Groq, OpenRouter, Cerebras) are confirmed working.
- **Dedicated API keys, not shared with agent-second-brain.** Testing surfaced that Gemini's free-tier rate limit is per Google Cloud *project*, not per API key (confirmed via research) — so `agent-second-brain`'s other automation (Antigravity, its CI scripts) can silently starve job-hunting's quota if they share a key, and a second key in the *same* project would not have fixed this. Job-hunting gets its own Google Cloud project (new project, same Google account) for a dedicated Gemini key, plus its own separate Groq/OpenRouter/Cerebras keys, all in job-hunting's own `.env` — never copied from `agent-second-brain`'s.

## 6. Removed, not extended

These are deleted as part of this rebuild, not built upon, since Facebook sourcing is confirmed staying human-driven:

- `scripts/facebook-cli.mjs`, `scripts/init-facebook-session.mjs`, `scripts/facebook-scraper.mjs`, `scripts/scroll-facebook-jobs.mjs`
- `src/app/api/facebook/init-session/route.ts`, `src/app/api/facebook/scroll-feed/route.ts`, `src/app/api/facebook/status/route.ts`
- `src/app/api/jobs/scrape-facebook/route.ts`
- `.browser-sessions/` (the persistent Playwright profile directory these scripts created)

The existing `/api/jobs` POST route (pasted `rawText` → `parseJobText` → saved job) is kept and becomes the Facebook ingestion entry point permanently, not a stopgap.

## 7. Phase B — ATS Auto-Apply Browser Agent (build after Phase A is verified working)

### 7.1 Scope and tooling

For jobs with a direct application URL (`contactMethod.type` of `form` or `portal` — currently only realistic for Greenhouse/Lever/Ashby-sourced jobs, which always link to their own Apply page), instead of drafting a cold email, an AI-driven browser agent fills out and — depending on `auto_submit_application` — submits the actual application on the company's site.

Built on **Stagehand** (Browserbase's open-source SDK: TypeScript-native, built on Playwright, `act()`/`extract()`/`observe()`/`agent()` primitives for natural-language-driven page interaction instead of brittle CSS selectors), chosen over building a custom vision-loop agent per the standing reuse-over-rebuild preference. Runs against a locally Playwright-managed browser process (no Browserbase cloud-service dependency required), consistent with the persistent-local-process runtime already decided.

Jobs whose only contact method is an email address (most Facebook posts) are unaffected and continue through the cold-email path in §5.

### 7.2 Data model

```sql
CREATE TABLE IF NOT EXISTS public.ats_applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_application_id UUID REFERENCES public.job_applications(id) ON DELETE CASCADE,
  apply_url TEXT NOT NULL,
  filled_fields JSONB DEFAULT '{}'::jsonb,      -- field label -> value the agent filled
  screening_answers JSONB DEFAULT '[]'::jsonb,  -- [{question, answer}] for free-text screening questions
  agent_action_log JSONB DEFAULT '[]'::jsonb,   -- ordered list of every action the agent took, for audit
  status TEXT DEFAULT 'pending', -- pending, filling, awaiting_confirmation, submitted, error
  error_message TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ats_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissive (no-auth) access to ats applications" ON public.ats_applications FOR ALL USING (true) WITH CHECK (true);
```

`agent_action_log` exists specifically so the user can verify what the agent actually did on a real company's site before trusting `auto_submit_application` — the same "show real evidence, not a claimed-success line" standard applied to verifying `ai-battery` in this session.

### 7.3 Master-profile completeness

Common ATS screening questions (work authorization / visa sponsorship status, willingness to relocate, notice period) have no home in the current `MasterProfile` type (`src/types/profile.ts`) — only `JobPreferences.minSalaryTHB` and `targetLocations` exist today. Without real answers to draw from, the agent would have to guess or leave these blank, which is worse than not asking at all for a live application. `MasterProfile` gets a small `screeningDefaults` object (work authorization status, visa sponsorship needed y/n, notice period, willingness to relocate) that both the Stagehand agent (§7) and the cold-email tailoring stage (§5.4) can draw on for exactly this kind of recurring question, instead of the AI inventing an answer per job.

### 7.4 Guardrails

- The agent is constrained to the specific job's `apply_url` and pages it navigates to from there — it does not go looking for other actions on the company's site.
- A hard step/timeout limit prevents a runaway loop from an agent that gets stuck on an unexpected page state.
- On a CAPTCHA or other bot-challenge, the agent stops immediately and sets `status = 'error'`. This is a firm boundary, not a tunable setting: circumventing another company's anti-bot measures is out of scope regardless of how `auto_submit_application` is set.
- Even with `auto_submit_application` on, the agent still writes `filled_fields`/`screening_answers` before submitting, so a submitted application's content is always reviewable after the fact, not just before.

### 7.5 Volume safeguard

Mirrors §5.1's `max_daily_auto_tailor`: a fully AI-agent-driven form fill costs many LLM calls per application (reading the page, deciding and verifying each action), and shares the same free-tier budget — including Cerebras' hard 200/day cap — that `auto_tailor` also draws on. `pipeline_settings` gets a fifth field, `max_daily_auto_apply` (integer, default 10), capping how many ATS applications the agent will attempt per day; beyond that, remaining `tailored` jobs with a form/portal contact method wait for the next day or a manual trigger. Without this, a busy ingestion day could let ATS-apply attempts silently starve tailoring's share of the same budget, or vice versa.

### 7.6 Submit gate

`awaiting_confirmation` → `submitted` is gated by `auto_submit_application` (§5.1). Off: the review screen shows every filled field, every AI-generated screening-question answer, and the attached PDF resume, with a single "Confirm & Submit" action. On: the agent proceeds directly to clicking Submit once filling completes. This was an explicit, informed choice — the user was shown the parallel to the hard-gated cold-email send and chose toggleable instead, consistent with the "verify manually, then trust it" philosophy applied to every other automation in this design.

## 8. Build order

Phase A end-to-end (ingest → tailor → PDF → cold-email review → send) is the priority — it delivers the core value and exercises the Supabase migration, the pipeline orchestrator, and the ai-battery integration, all of which Phase B depends on. Phase B (Stagehand ATS agent) is a substantial, mostly-independent subsystem with its own real-world risk surface (submitting to live companies) and should not start until Phase A is manually verified working end-to-end on at least one real job.

**Testing.** This project has no test suite today. Given real emails and, in Phase B, real job applications now depend on the pipeline's stage-transition logic behaving correctly, the plan adds **Vitest** (clean fit for a Next.js/TypeScript project, minimal config) with unit tests scoped narrowly to: the `runStage`/toggle-chaining orchestrator (does it chain when the flag is on, stop when it's off, land in `error` on failure, respect the daily caps below), and the Facebook `parseJobText`-style extraction logic. This is not a call for full app coverage — it's specifically the state-machine and parsing logic where a silent bug is expensive to discover late (a wrongly-sent email or a wrongly-submitted application, not just a UI glitch). Anything touching a real external service (AI calls, email, the browser agent) stays verified by actually running it and inspecting real output, the same way `ai-battery` was verified in this session — mocking those away would hide exactly the kind of failure (quota exhaustion) this design already found.

## 9. Open items for the implementation plan to resolve

- Whether Stagehand's LLM calls route through `@savewaris/ai-battery` (consistent cost/provider story) or need a separate, directly-configured model client — Stagehand's provider interface needs checking against ai-battery's call shape during implementation.
- Exact `pipeline_stage` UI presentation (Kanban-style board vs. table) — deferred to whoever writes the plan/implements, not an architectural fork.
- `Jobbkk`/`WorkVenture` sourcing remains unverified (per the decision doc) — out of scope for this spec; add only after a manual network-tab check confirms a usable endpoint.
