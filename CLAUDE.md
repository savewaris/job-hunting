# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server (localhost:3000; app code/comments sometimes reference :3001)
npm run build         # production build
npm run start          # serve production build
npm run lint            # next lint

npm run sync-profile      # node scripts/sync-profile.mjs  — pulls resume data from a sibling PersonalWebsite project's Neon/Prisma DB into src/domain/profile/master-profile.json
```

There is no test suite configured (no test script, no test files). Verify changes via `npm run build` and manual exercise of the affected route/page.

## Architecture

This is a Next.js 14 App Router project, currently a small, intentionally minimal rebuild ("clean slate rebuild", see git log) of a larger planned job-hunting suite. Two features are wired up end-to-end today:

1. **Master Profile** (`src/domain/profile/`) — a single-user resume/profile record.
2. **Facebook Job Sourcing** (`src/domain/jobs/`) — capturing job posts scraped or pasted from Facebook.

### Data flow: local JSON files, not the database — yet

Despite `@supabase/supabase-js` being a dependency and `supabase/schema.sql` defining a full multi-table schema (`job_applications`, `master_profiles`, `tailored_documents`, `interviews`, `offers`, `cold_emails`), **no code in `src/` currently talks to Supabase.** Both domains persist to flat JSON files checked into the repo and read/written synchronously with `fs`:

- `src/domain/profile/master-profile.json` — the current master profile, regenerated wholesale by `scripts/sync-profile.mjs`.
- `src/domain/jobs/jobs.json` — the list of captured jobs, appended to by the Facebook scraper scripts and the `/api/jobs` POST route.

`src/domain/*/index.ts` files are the read/write boundary for each JSON store (`getMasterProfile`, `getSavedJobs`, `saveJob`, `parseJobText`). API routes and scripts go through these functions rather than touching the JSON files directly. When extending persistence, either keep using this JSON-file pattern for consistency with the existing code, or treat wiring up the already-defined Supabase schema as a deliberate, separate migration — don't half-migrate one field at a time.

`supabase/schema.sql` encodes a "no-auth" tradeoff worth knowing if that migration ever happens: `auth.uid()`-based RLS policies are defined and then immediately dropped/replaced with permissive `USING (true)` policies, because this app has no Supabase auth flow (single personal user, anon key only).

### Facebook job sourcing: manual paste only, no automation

Facebook sourcing is deliberately human-driven: the user browses Facebook themselves and pastes the raw post text into the app (`/api/jobs` POST route, handled by `parseJobText` in `src/domain/jobs/index.ts`). There is no autonomous login, session, or scraping — a prior implementation that logged into a real Facebook account via Playwright and scrolled the feed was removed because it contradicted this project's explicit decision to avoid automated Facebook access (ban/ToS risk). Do not reintroduce Playwright-based Facebook automation.

### Profile sync has a hard-coded external dependency

`scripts/sync-profile.mjs` imports Prisma directly from a sibling project at the absolute path `C:\save\Projects\PersonalWebsite` and connects to that project's Neon Postgres instance to pull skills/experience/education/projects. This only works on a machine with that sibling project present, and the DB connection string is currently hard-coded in the script rather than read from env. Treat this script as environment-specific tooling, not a portable part of the app.

### Path aliases & conventions

- `@/*` maps to `src/*` (see `tsconfig.json`).
- Domain modules (`src/domain/**`) are plain server-side functions (fs-based), imported directly into Server Components (e.g. `src/app/page.tsx`) for initial data, and re-fetched from Client Components via `fetch('/api/...')` after mutations (see `ProfileView.tsx`'s sync flow for the pattern: local `useState` seeded from `initialProfile`, then replaced with the API response).
- API routes under `src/app/api/**` follow a consistent `{ success: boolean, ...payload }` / `{ success: false, error }` JSON response shape.
- Styling is Tailwind, dark-theme-only (`bg-[#090d16]`, slate palette), icons from `lucide-react`.

### Git worktrees

`.worktrees/` may contain active worktrees for in-progress branches (e.g. CI workflow setup, bug fixes) alongside `main`. Check `git worktree list` before assuming `main` is the only checkout in play.
