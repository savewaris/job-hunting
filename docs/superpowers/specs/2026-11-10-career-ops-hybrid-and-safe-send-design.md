# career-ops hybrid + safe email sending — design

Date: 2026-11-10. Status: DRAFT, awaiting the user's approval. Nothing in this document is built yet.

## Intent
The user wants to be sure they can really send job applications, and wants to reuse the open-source
career-ops project (github.com/career-ops-hq/career-ops, MIT) instead of maintaining everything here.
They apply about equally by (a) emailing a contact (Thai employers, Facebook posts, JobsDB) and
(b) web forms on company career pages / ATS.

## Decisions made by the user
- PR #8 conflict: keep the Postgres (`getDb()`) design; drop PR #8's Supabase pipeline and cold-email queue.
  Done on branch `feat/auto-apply-postgres`: origin/main merged with the "ours" strategy (be49926) so
  the branch is mergeable; only the job-dedup gap was ported (5792348).
- Hybrid: career-ops for finding, scoring (1-5 fit), tailoring and ATS web forms (user presses Submit).
  This app is kept, slimmed, for email applications: approval Inbox + Gmail send.
- career-ops AI provider: Claude Code on the user's subscription (ANTHROPIC_API_KEY must stay unset).
- Data store: local on-disk database now (`DEV_DB_DIR=.dev-db`), Supabase (`DATABASE_URL`) later.

## Goals
1. Every real send is deliberate: nothing is emailed without an explicit Approve click.
2. The UI never claims an application was sent when it was not.
3. A failed send can be retried without creating a duplicate email.
4. career-ops runs next to this app, in its own folder, never nested in this repo.

## Non-goals / anti-goals
- No auto-submit of anything, ever (career-ops itself never POSTs a form).
- No second email-sending path (PR #8's cold-email queue is intentionally not ported).
- Do not rewrite career-ops; do not copy its code into this repo.
- Anti-goal: a card marked "applied" with no email actually sent.

## Work items (in order)
1. Safe send fix (this repo, TDD). Confirmed in `src/app/api/inbox/[id]/resolve/route.ts`:
   a. When `EMAIL_*` is unset the mailer returns `simulated: true`, yet the card is moved to `applied`.
      Fix: only move to `applied` when `sent === true`; when simulated, keep the card un-applied and tell the UI.
   b. The inbox item is resolved before the send; if the send throws, the error is only logged and the item
      cannot be approved again (409). Fix: record delivery outcome, and allow retry of a failed delivery
      without double-sending (idempotency key = inbox item id + a `delivered_at` column or equivalent).
   c. Subject/filename hard-code the candidate's name; read it from the Master Profile.
2. Local run config (no secrets in the repo): `.env.local` with `DEV_DB_DIR=.dev-db`, `EMAIL_SERVICE=gmail`,
   `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `EMAIL_FROM_NAME`. The user creates the Gmail app password and
   pastes it themselves; the agent never needs to see it.
3. One real end-to-end test send to the user's own address (explicit approval at that moment).
4. career-ops install in a sibling folder `C:\save\Projects\career-ops` (my call, not asked):
   clone, read the code, `npm install` (its only install hook downloads Chromium), `cv.md` generated from
   `master-profile.json`, `config/profile.yml` (roles: Full Stack Developer and close titles; Bangkok and
   remote), `portals.yml` seeded with Thai-relevant boards it supports (Jobstreet, Kalibrr).
5. Hand-off: a small importer that reads career-ops's shortlist (`data/pipeline.md` / `data/applications.md`)
   and creates `job_applications` rows + inbox approval items. The minimum fit score to import is a later
   question for the user.

## Known risks
- career-ops is large (v1.39, hundreds of scripts). Only its manifest and install hooks were reviewed so
  far; scripts are to be read before they are run (untrusted-repo protocol).
- Thailand coverage in career-ops is partial (Jobstreet, Kalibrr, Telegram channels); JobsDB and Facebook
  posts are not supported by it, which is why the paste flow in this app stays.
- career-ops sends the CV, phone and email to the AI provider (Anthropic via Claude Code, as chosen).
- Local file DB is lost if `.dev-db` is deleted; move to Supabase before relying on it long term.
- The builder-check subagent in the brainstorming skill was not run (no subagent requested); the author
  re-read this document as that builder instead.

## What the user has to do
- Create a Gmail app password (needs 2-step verification) and put it in `.env.local` themselves.
- Approve the test send, and every real send, at the moment it happens.
- Later: choose the minimum fit score, and whether to move to Supabase.
