# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and AI agents when working with code in this repository.

## Commands

```bash
npm run dev               # Next.js dev server bound to 127.0.0.1:3000 (next dev -H 127.0.0.1)
npm run build             # production build
npm run start             # serve production build bound to 127.0.0.1:3000 (next start -H 127.0.0.1)
npm run lint              # next lint (currently requires ESLint setup if invoked interactively)
npm test                  # vitest run (use npx vitest run --maxWorkers=4 under heavy CPU load)

npm run db:migrate        # tsx scripts/migrate.ts — applies supabase/migrations/*.sql against DATABASE_URL
npm run db:import-legacy  # tsx scripts/import-legacy-jobs.ts — imports src/domain/jobs/jobs.json into job_applications
npm run db:seed-dev       # tsx scripts/seed-dev.ts — seeds local DEV_DB_DIR PGlite store (pass -- --force to reseed)

npm run sync-profile      # node scripts/sync-profile.mjs — pulls resume data from sibling PersonalWebsite Neon/Prisma DB into src/domain/profile/master-profile.json
npm run scrape:fb         # node scripts/facebook-cli.mjs — standalone Playwright CLI for sourcing jobs from Facebook
```

Always start the server via `npm run dev` or `npm run start` so that `-H 127.0.0.1` is passed; a bare `next dev` or `next start` binds to all network interfaces (`0.0.0.0`).

## Architecture

This is a Next.js 14 App Router application for autonomous job hunting, combining a local-only dashboard (Inbox, reusable Answer Bank, Kanban Board, Metrics, Settings, and Run orchestrator) with Master Profile syncing and Facebook job sourcing.

### Data flow: Postgres via `src/lib/sql.ts` (plus Master Profile JSON)

Application, inbox, answer-bank, settings, and run state live in Postgres and are accessed server-side through the `Sql` interface in `src/lib/sql.ts`:

- **Production / Supabase Postgres (`DATABASE_URL`)**: `getDb()` creates a `pg` connection pool validated by `assertSecureConnection` (requires TLS for non-loopback hosts, strict allow-list of query parameters, and never passes the raw unvalidated URL string to `Pool`).
- **Local Dev Store (`DEV_DB_DIR`)**: When `DEV_DB_DIR` is set (e.g. `.dev-db`) and `DATABASE_URL` is unset in non-production, `getDb()` lazily opens a persistent on-disk PGlite database and applies `supabase/migrations/*.sql`.
- **Automated Tests (`tests/helpers/testDb.ts`)**: `createTestDb()` spins up an in-memory PGlite instance with real migrations applied and injects it via `setDb()` (`NODE_ENV === 'test'` only).
- **Master Profile (`src/domain/profile/master-profile.json`)**: Remains a flat JSON file checked into the repo and regenerated wholesale by `scripts/sync-profile.mjs`.
- **Facebook Job Sourcing (`src/domain/jobs/jobs.json`)**: Standalone Playwright scraper scripts (`scripts/*.mjs`) still append to `jobs.json`. `npm run db:import-legacy` and the web API scraper routes bridge `jobs.json` into the `job_applications` Postgres table idempotently via `syncLegacyJobs(sql)` / `importLegacyJobs(sql, jobs)` in `src/domain/applications/legacy.ts`. (Legacy fields `author`, `postedAt`, and `matchScore` have no DB column and remain only in `jobs.json`.)

### Strict RLS & Localhost-Only Security Model

- **Strict RLS (No Anon Access)**: Supabase is used strictly as hosted Postgres via the server-side `DATABASE_URL`. Migration `0001_auto_apply_core.sql` enables Row Level Security on all tables (`job_applications`, `answer_bank`, `inbox_items`, `skip_reasons`, `app_settings`, `runs`) with **no policies**, and drops the legacy permissive policy on `job_applications`. Browser / `NEXT_PUBLIC_SUPABASE_ANON_KEY` queries via PostgREST cannot read or write any rows.
- **Localhost Binding & Middleware Guard**: The server binds to `127.0.0.1` and `src/middleware.ts` (`src/lib/localOnly.ts`) enforces that `Host` is loopback (`localhost`, `127.0.0.1`, `[::1]`) and blocks cross-site requests via `Origin` and `Sec-Fetch-Site` checks. `next.config.js` sets `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` on all routes.

### Facebook job sourcing: three separate entry points, one CLI

Facebook scraping is Playwright-based and **always runs non-headless** against a persistent browser profile at `.browser-sessions/facebook-profile/` (so a manual login persists across runs). There are three ways to trigger it:

- `scripts/facebook-cli.mjs` (`npm run scrape:fb`) — standalone terminal CLI. `--url <postUrl>` scrapes one post directly; with no args it opens an interactive feed-scroll mode. Run `npm run db:import-legacy` afterwards (or trigger a web scrape) to copy newly scraped jobs from `jobs.json` into Postgres.
- `src/app/api/facebook/*` routes (`init-session`, `status`, `scroll-feed`) — spawn/poll the underlying scripts from the web UI via `child_process` and sync `jobs.json` into Postgres.
- `src/app/api/jobs/scrape-facebook/route.ts` — spawns `scripts/facebook-scraper.mjs` for a single-URL scrape triggered from the UI and syncs `jobs.json` into Postgres.

All parsing logic (title/company/salary/tech-stack/contact-method extraction from raw Thai/English post text) is duplicated between `src/domain/jobs/index.ts` (`parseJobText`, used by `/api/jobs` for pasted text) and `scripts/facebook-cli.mjs`. Keep both in sync if you change the extraction heuristics.

### Profile sync has a hard-coded external dependency

`scripts/sync-profile.mjs` imports Prisma directly from a sibling project at `C:\save\Projects\PersonalWebsite` and connects to that project's Neon Postgres instance to pull skills/experience/education/projects. Treat this script as environment-specific tooling.

### Path aliases & conventions

- `@/*` maps to `src/*` (see `tsconfig.json` and `vitest.config.mts`).
- Pages (`src/app/**/page.tsx`) are dynamic Server Components (`export const dynamic = 'force-dynamic'`) that query domain repositories (`src/domain/*/repo.ts`) via `getDb()` and pass plain JSON props to Client Components. Client Components mutate via `fetch('/api/...')` and call `router.refresh()`.
- API routes under `src/app/api/**` use `ok()` / `fail()` from `src/lib/http.ts` to return `{ success: true, ...payload }` or `{ success: false, error }`.
- Styling is Tailwind, dark-theme-only (`bg-[#090d16]`, slate palette), icons from `lucide-react`.

### Git worktrees

`.worktrees/` may contain active worktrees for in-progress branches alongside `main`. Check `git worktree list` before assuming `main` is the only checkout in play.
