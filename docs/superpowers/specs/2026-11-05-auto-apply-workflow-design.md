# Auto-Apply Workflow — Design

**Status:** Draft, awaiting user approval
**Date:** 2026-11-05
**Builds on:** `2026-09-27-job-hunting-pipeline-architecture-design.md` (pipeline stages, per-action on/off settings, Supabase data model, ATS browser agent). Where this document differs, this one wins. Differences are listed in "Relationship to the 2026-09-27 spec".

## 1. Intent

The user wants to stop applying to jobs by hand. Today they find roles on company career pages, fill in forms, write cover letters and email resumes themselves. They want a tool that does the repetitive work, while they stay in control of everything that is sent in their name.

The user's own words for the workflow:
- Find Full Stack Developer (or similar) roles on companies' own career pages.
- If a company has an online application form, fill it in. If the company wants an email, send one with the resume, GitHub link and personal website.
- They worry about the cover letter: length limits, and the AI saying things about them that are not true.
- They do not know what a progress dashboard should contain and asked for research.
- **They review everything before it is sent.**
- They cannot sit in front of the tool while it runs, so anything it needs from them must be queued and answered later.

## 2. Goals

- G1. A single dashboard where the user sees what needs them, what has been sent, and how the search is going.
- G2. For each job found, the tool prepares a tailored resume and a cover letter (or email), and waits for approval.
- G3. Nothing untrue is ever put in front of an employer (see section 6).
- G4. When the tool is stuck on something only the user can answer, it parks that job, asks in an Inbox, and continues with other jobs. It never waits on a live session.
- G5. Answers are reusable: the user answers "expected salary" once, not once per company.
- G6. Starting a run is a button press. Scheduling is designed in but switched off.

## 3. Non-goals

- NG1. No sending, submitting or uploading anything without the user's explicit approval of that specific application.
- NG2. No scheduled or unattended runs in the first version. The schedule setting exists but is off and not wired up.
- NG3. No LinkedIn automation. No Facebook automation (unchanged from the 2026-09-27 spec).
- NG4. No CAPTCHA or bot-check bypass. On a challenge, the tool stops that job and reports it.
- NG5. No multi-user support or logins. This stays a single-user personal tool.
- NG6. No overseas roles that require relocation.

## 4. Anti-goals (this is a failure even if it "works")

- A cover letter, resume or form answer that claims a skill, employer, number or date not in the user's Master Profile.
- Anything sent that the user did not see and approve.
- A tool that goes quiet and leaves jobs stuck with no sign of why.
- A dashboard that only shows column counts and does not help the user improve their search.

## 5. Scope: five sub-projects, built in this order

The user agreed to an order of dashboard, finding roles, email applying, then form filling. Reply tracking (added later, section 8a) slots in after email applying. Each gets its own plan. After step 3 the user has a complete working flow for email applications.

1. **Dashboard, Inbox and data.** The board, the Inbox, the answer bank, the rates, the Run button and the settings. Moves storage from JSON files to the Supabase tables already defined in `supabase/schema.sql`.
2. **Finding companies and roles.** Builds and maintains the company list. Scans career pages for matching roles.
3. **Tailoring and email applying.** Per-job resume and cover letter or email, truth-checked, approved by the user, then sent.
4. **Reply tracking from Gmail** (section 8a). Reads the user's inbox for replies to applications so none are missed, and feeds the reply and interview numbers on the dashboard. It needs sent applications to exist, so it is built right after step 3.
5. **Filling company application forms.** The browser agent that fills and (after approval) submits forms. Built last because it is the riskiest. This document only outlines it.

## 6. Truthfulness rules (user's core concern)

The user said the AI putting untrue information about them is a main worry. These are rules in the tool, not requests to the AI.

- **Source of truth.** Every fact in a letter, tailored resume or form answer must come from the Master Profile (`src/domain/profile/master-profile.json`) or from an answer the user typed in the Inbox.
- **Tailoring means choosing and re-wording, not inventing.** The tailored resume may reorder sections, pick the most relevant projects and skills, and shorten or re-word existing bullets. It may not add a skill, employer, title, degree, number or date.
- **Visible evidence.** In the review screen, each claim in a letter links to the profile line it came from. Any sentence the check cannot trace is highlighted, and an application with highlighted sentences cannot be approved until it is fixed or removed.
- **Resume comparison.** The review screen shows the tailored resume next to the master resume with changes highlighted.
- **Questions the profile cannot answer** (expected salary, notice period, visa or work authorisation, and the like) are never guessed. They go to the Inbox.

*How the claim-tracing check is built is left to the builder (section 11). The requirement is the behaviour above.*

## 7. Length limits

- If a form or posting states a character or word limit for the cover letter or any answer box, the tool writes to fit and checks the final text against the limit before it reaches review.
- If no limit is stated, the default cover letter length is about 150 to 200 words. *(My call, not the user's.)*
- Text that would be cut off by a limit is never silently truncated. It is rewritten shorter, or flagged.

## 8. The Inbox and the answer bank

The tool never waits for the user. When it needs something, it writes the question down and moves on.

- **Inbox.** One list of everything that needs the user: questions the profile cannot answer, drafts waiting for approval, and jobs that hit an error or a CAPTCHA. Each item says which job it belongs to.
- **Answering.** The user opens the dashboard when they like and works through the list. Each approval item offers Approve, Edit and Skip.
- **Resuming.** Each run begins by checking the Inbox for items the user has since answered. Jobs with answers continue from where they stopped. The tool does not need to detect that the user has come back; it only reads saved state.
- **Answer bank.** Answers to general questions (salary, notice period, visa and the like) are saved and reused for later jobs. The user can view and edit them. A question already in the bank does not appear in the Inbox again.
- **Skip with a reason.** When the user skips a job, the tool asks for a quick reason (for example too senior, bad pay, not interested in the company). After several skips, it suggests rules based on those reasons. *(My proposal.)*

## 8a. Reply tracking (user decision: the tool reads Gmail)

**Why:** the user has repeatedly lost track of employer replies in Gmail and wants a system for it. Stated: "I want you to do it for me because I didn't find them by myself anymore in Gmail because I have missed about them a lot."

- **What it does.** On each run, and on a separate "Check replies now" button *(my call)*, the tool reads recent mail in `savewaris@gmail.com`, finds messages that look like replies to applications, and shows them in the Inbox as "a company replied". A reply that looks like an interview invite or a request for information is marked as needing the user, at the top of the Inbox.
- **Matching a reply to a job.** For emails the tool sent, it matches by Gmail thread. For form applications, replies come from the company or its hiring system, so it matches by company name, the company's email domain, and known hiring-system senders. *Exact heuristics are left to the builder.*
- **Possible misses.** Matching will not be perfect. Mail that looks job-related but cannot be matched appears in a separate "Unmatched, could be a job reply" list rather than being dropped. This list exists because the user's real problem is missed replies.
- **Status changes need one click.** The tool suggests a status change (for example Applied to Interviewing, or to Rejected) and the user confirms it. It does not change the board on its own. *(My guess, in line with the review-first rule.)*
- **Read-only.** The reply reader has read-only Gmail access and sends nothing. Sending remains a separate, approved action (section 12).
- **Privacy limit.** It only looks at mail that matches known applications or job-related senders, and stores just what it needs: sender, subject, date, a short excerpt and the job it belongs to. It does not copy the whole inbox. *(My call.)*
- **Credentials.** Gmail access is granted by the user through a normal Google sign-in for this app. The access token is kept on the user's PC and not committed to git. *Choice of OAuth setup is left to the builder.*
- **Feeds the dashboard.** Reply data drives the response rate, interview rate and time-to-first-reply numbers in section 9, so the user does not have to mark outcomes by hand.

## 9. Dashboard

The user asked for research. Findings (web sources, mostly job-tool vendors, so treat figures as rough) are summarised here; the sources were shared in conversation.

First screen: **the Inbox** (things waiting for the user). Then:

- **Board** with columns Wishlist, Applied, Interviewing, Offer, Rejected, plus a "Needs your input" state and a "Maybe" list for jobs filtered out (see section 10). These map onto the existing `job_applications.status` values.
- **Rates, computed from the user's own data:**
  - Response rate: replies divided by applications.
  - Application-to-interview rate.
  - Interview-to-offer rate.
  - Applications sent per week.
  - Time from sending to first reply.
- **Reading the rates:** a low response rate suggests targeting or the resume needs work; a low interview-to-offer rate points at interview performance. The dashboard may show this hint beside the numbers *(my guess)*.
- **No outside benchmarks.** Compare the user's rates with their own earlier weeks. Sourced benchmarks were weak.

## 10. Roles and companies

- **Target roles.** Full Stack Developer and close titles, such as Full Stack Engineer, Software Engineer and Web Developer. *(Close titles are my guess; the user said "or something like that".)*
- **Location.** Companies hiring in Bangkok, plus remote or work-from-anywhere roles. Overseas roles must be remote or work-from-anywhere; relocation roles are skipped.
- **Company list.** The tool builds and maintains it; the user does not provide one. The user can add and remove companies *(my call)*.
- **Starter filters** *(my guess, adjustable)*: titles containing Senior, Lead, Principal or Manager, and postings asking for 5 or more years, go to a "Maybe" list rather than being deleted. The user did not give skip rules yet; the tool starts with these and learns from skip reasons.
- **Sources.** Career pages directly, using public job-board APIs where a company's page is hosted on Greenhouse, Lever or Ashby (carried over from the 2026-09-27 spec). Respect each site's terms and robots rules. No LinkedIn.

## 11. Running it

- **Trigger.** A Run button in the dashboard. A run is one self-contained job: check the Inbox for answered items, find new roles, prepare drafts, park anything that needs the user.
- **Schedule.** A setting for scheduled runs is included, off by default, like the other automatic-action settings in the 2026-09-27 spec. It can be wired up later without changing the run itself.
- **Limit to note.** The browser-based parts need the user's PC on with a browser available. A schedule therefore only works while the PC is on, unless the tool later moves to a cloud machine.

## 12. Sending

- **Email applications.** Sent from `savewaris@gmail.com` with the approved tailored resume as a PDF, plus the GitHub link and personal website in the email. Library choice (`nodemailer` with a Gmail app password) carries over from the 2026-09-27 spec.
- **Form applications (sub-project 4).** The agent fills the form, stores what it entered, and stops before Submit. The user approves in the dashboard, then the agent submits.
- **Always manual send.** There is no setting that lets a send happen without approval. This is stricter than the 2026-09-27 spec's optional auto-submit toggle (see below).

## 13. Constraints

- Single user, no login.
- Stack: the existing Next.js 14 app, Playwright for browser work, Supabase for data. *(My call; the user handed the choice to me.)*
- Moving storage from JSON files to Supabase is one planned change, not a gradual one, as `CLAUDE.md` advises.
- The browser parts run on the user's own machine.
- The user's Master Profile is the source of truth and is currently synced from a sibling project by `scripts/sync-profile.mjs`. That script is environment-specific and stays as it is unless the plan says otherwise.

## 14. Relationship to the 2026-09-27 spec

- **Kept:** pipeline stages, the Supabase data model direction, on/off settings for automatic actions (default off), CAPTCHA stop, the action log for the browser agent, no LinkedIn, no Facebook automation, single-user trade-offs.
- **Changed:** the `auto_submit_application` setting is removed. The user decided to review everything before sending, so no setting may skip approval.
- **Added:** the Inbox and answer bank, the truthfulness rules, per-job tailored resumes with a visible comparison, company-list discovery, the skip-reason learning, and the dashboard rates.

## 15. Left to the builder

- The exact database changes to support the Inbox, answer bank, company list and skip reasons.
- How to trace letter claims back to profile lines.
- How companies are discovered and how career pages are read, within the constraints above.
- How the Run button starts work given the browser parts run locally.
- Dashboard layout and visual design (to be checked in a real browser before it is called done).
- Retry and error behaviour for failed runs.
- Which AI provider handles drafting, using the existing provider setup.

## 15a. Calls made after the builder check (my calls, for the user to check)

- **Old spec and plan.** The 2026-09-27 spec and its implementation plan were never built (no `pipeline_settings`, `pipeline_stage`, `ats_applications` or `src/domain/pipeline` exist). The new plan supersedes the old plan. The builder may reuse parts of it where they still fit, but nothing in it is assumed to exist.
- **Sources.** Career pages directly, plus Greenhouse, Lever and Ashby where a company uses them. JobThai and JobsDB Thailand (named in the old spec) are not part of the first pass; they can be added later as extra sources. Pasting a Facebook post by hand keeps working as it does today.
- **Existing captured jobs.** The two entries in `src/domain/jobs/jobs.json` are migrated into the new tables when storage moves.
- **Form-only jobs before sub-project 4 exists.** They are not skipped. They appear in the Inbox as "apply manually", with the tailored resume and cover letter ready to copy.
- **Where the app runs.** Localhost on the user's PC only. The Run and send routes must not be reachable from outside the machine. Deploying it publicly is out of scope; doing so later needs a real login first.
- **Replacing deleted features.** The daily AI-call cap from the old spec carries over as a setting (default 20 drafts per run), so free-tier AI quotas are not exhausted in one run.
- **Corrections to the profile.** If the user spots a wrong fact during review, the fix is made in the Master Profile itself, not in a one-off override.

## 16. Open items for the user

- **Language of letters, emails and resumes: decided by the user.** Match the language of the posting (Thai posting gets Thai, English posting gets English). Consequences for the builder: the Master Profile needs a Thai version of its text (or a faithful translation that the truth check still traces back to the English source); length limits are counted in the unit the form uses; the review screen shows which language was chosen and lets the user switch it.
- **Phone number.** The user gave `+66 95 045 7333`. The Master Profile currently holds a placeholder (`+66 81 234 5678`). The profile file is regenerated by `scripts/sync-profile.mjs` from the sibling PersonalWebsite database, so the correction must be made at that source or it will be overwritten on the next sync. **No resume or email may be sent until the profile shows the correct number.** The builder's first step for sub-project 3 is to check this.
- Confirm the starter filters and target job titles in section 10 are acceptable.
- Confirm the 150 to 200 word default for cover letters.
