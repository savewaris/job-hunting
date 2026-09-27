# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server, bound to 127.0.0.1:3000 (falls back to 3001 if taken)
npm run build             # production build
npm run start              # serve production build
npm run lint                # next lint
npm test                     # vitest run — unit tests for domain modules and API routes

npm run sync-profile      # node scripts/sync-profile.mjs — pulls resume data from a sibling PersonalWebsite project's Neon/Prisma DB into src/domain/profile/master-profile.json
```

`npm run dev` binds to `127.0.0.1` rather than the default `0.0.0.0` so the app (which sends real emails and holds a live Supabase session) isn't reachable from the rest of the LAN.

## Architecture

This is a Next.js 14 App Router app implementing an end-to-end job-application pipeline: capture a job post, tailor a resume/cover-letter to it with AI, review the drafted cold email, and send it with a generated PDF resume attached.

### Data flow: Supabase, not local JSON files

All persistence goes through `@supabase/supabase-js` against the tables defined in `supabase/schema.sql` (`job_applications`, `master_profiles`, `tailored_documents`, `cold_emails`, `pipeline_settings`, plus `interviews`/`offers` which nothing yet writes to). There is no Supabase auth flow — this is a single personal user, anon key only — so `schema.sql` defines `auth.uid()`-based RLS policies and then immediately replaces them with permissive `USING (true)` policies. Every route in the app is correspondingly unauthenticated by design; do not add auth to just one route without addressing the whole app.

`src/lib/supabase.ts` is the one `getSupabaseClient()` used everywhere. It passes a custom `fetch` with `cache: 'no-store'` into `createClient` — without this, Next.js's Data Cache patches the global `fetch` and silently caches Supabase's own internal GET requests, so toggled settings or newly-written rows can appear stale on the next read even from a Server Component marked `dynamic = 'force-dynamic'`.

`src/domain/profile/master-profile.json` is the only remaining flat-file store, regenerated wholesale by `scripts/sync-profile.mjs`; it isn't part of the Supabase pipeline.

### The pipeline: `PipelineStage` and `src/domain/pipeline/`

Every captured job (`job_applications.pipeline_stage`, type `PipelineStage` in `src/types/job.ts`) moves through `new → tailoring → tailored → sent`, or `error` on failure (retryable back to `tailoring`).

- `src/domain/pipeline/tailorJob.ts` — `tailorJob(jobId)` atomically claims a job via `.update(...).eq('id', jobId).in('pipeline_stage', ['new', 'error']).select().maybeSingle()`; a `null` result means another caller already claimed it (idempotent, race-safe). On success it calls `generateTailoredContent` (`src/lib/ai-tailor-client.ts`, backed by `@savewaris/ai-battery`'s multi-provider fallback — Gemini/Groq/OpenRouter/Cerebras) with a prompt built from the real master profile and the job, writes a `tailored_documents` row and (if the job has an email contact) a `cold_emails` draft, then marks the job `tailored`. Any failure marks the job `error` with `stage_error` set and rethrows.
- `src/domain/pipeline/runStage.ts` — `runTailorNow(jobId)` is the manual entry point (only valid from `new`/`error`); `advancePipeline()` is the auto-tailor entry point gated by `pipeline_settings` (see below).
- `src/app/api/jobs/[id]/tailor/route.ts` — POST route the UI's "Tailor Now" button calls.
- `src/app/api/pipeline-settings/route.ts` — reads/writes the single `pipeline_settings` row (`auto_ingest_api_sources`, `auto_tailor`, `max_daily_auto_tailor`) that gates whether newly-captured jobs are tailored automatically instead of requiring a manual click.

### Job capture: paste-only, no automation

Facebook/job-board sourcing is deliberately human-driven: the user pastes raw post text into the UI, and `POST /api/jobs` (`createJobFromFacebookPaste` / `parseJobText` in `src/domain/jobs/index.ts`) extracts title/company/salary/tech-stack/contact-method and dedupes via `computeExternalId` (a SHA-256 hash of the raw text). There is no autonomous login, session, or scraping — a prior Playwright-based Facebook scraper was deliberately removed as a ban/ToS risk. Do not reintroduce browser automation against a real Facebook account.

### Cold-email review and send

`src/domain/cold-emails/` is the read/write boundary for the `cold_emails` table. `src/components/cold-emails/ColdEmailQueue.tsx` lists `draft`-status emails with editable subject/body (saved via `PATCH /api/cold-emails/[id]`, which whitelists only `subject`/`body` and rejects edits once `status = 'sent'`). Sending (`POST /api/cold-emails/[id]/send`) is idempotent — it short-circuits if the email is already `sent` — looks up the matching `tailored_documents` resume row (404s with a clear error if missing), renders it to a PDF via `src/lib/pdf/generateResumePdf.ts` (`@react-pdf/renderer`), and sends it with `nodemailer` using the `EMAIL_*` env vars. On success it marks the `cold_emails` row `sent` and the parent `job_applications` row `pipeline_stage = 'sent'` / `status = 'applied'`; a failure in that bookkeeping step is logged but does not undo an email that already sent.

`src/app/api/tailored-documents/[id]/pdf/route.ts` looks resumes up by `job_application_id` + `doc_type = 'resume'` (not the `tailored_documents` row's own `id` — every caller only has the job's id).

### Profile sync has a hard-coded external dependency

`scripts/sync-profile.mjs` imports Prisma directly from a sibling project at the absolute path `C:\save\Projects\PersonalWebsite` and connects to that project's Neon Postgres instance to pull skills/experience/education/projects. This only works on a machine with that sibling project present, and the DB connection string is currently hard-coded in the script rather than read from env. Treat this script as environment-specific tooling, not a portable part of the app.

### Environment variables

`.env.local` (gitignored; see `.env.example` for the placeholder shape) needs: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`; at least one of `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` / `CEREBRAS_API_KEY` for `@savewaris/ai-battery`'s fallback chain; and `EMAIL_SERVICE` / `EMAIL_USER` / `EMAIL_APP_PASSWORD` / `EMAIL_FROM_NAME` for real cold-email sending via nodemailer.

### Path aliases & conventions

- `@/*` maps to `src/*` (see `tsconfig.json`).
- Domain modules (`src/domain/**`) are plain server-side async functions over Supabase, imported directly into Server Components (e.g. `src/app/page.tsx`) for initial data, and re-fetched from Client Components via `fetch('/api/...')` after mutations.
- API routes under `src/app/api/**` follow a consistent `{ success: boolean, ...payload }` / `{ success: false, error }` JSON response shape.
- Styling is Tailwind, dark-theme-only (`bg-[#090d16]`, slate palette), icons from `lucide-react`.

### Git worktrees

`.worktrees/` may contain active worktrees for in-progress branches alongside `main`. Check `git worktree list` before assuming `main` is the only checkout in play.
