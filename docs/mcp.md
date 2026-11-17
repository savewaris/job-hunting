# MCP server

A local stdio MCP server lets an AI agent (Claude Code or any MCP client) find jobs, inspect the pipeline and queue work. **Approving and sending stay in the web UI**: no tool can approve an inbox item, send an email, submit a form or change settings.

Run it: `npm run mcp` (stdio; all logs go to stderr). Connect a client with `.mcp.json.example` (copy it to `.mcp.json` and fix the path). The example uses the `cmd /c` wrapper that Claude Code needs on native Windows; it has been checked by running the same command by hand, but not through `claude mcp add`.

## Tools

| Tool | Effect | Notes |
|---|---|---|
| `get_status` | read | settings, job counts by status, open inbox count, last run |
| `list_jobs` | read | optional `status`, `bangkokOnly`, `limit` (default 20, max 100) |
| `get_job` | read | one job + 1-5 fit score; description (max 4000 chars) under `untrusted` |
| `list_inbox` | read | open questions/approvals/errors; text under `untrusted` |
| `funnel_metrics` | read | applied/response/interview/offer counts and rates |
| `discover_jobs` | writes new rows | scans the target companies' career pages, Bangkok first, max 50 new roles |
| `skip_job` | writes | marks a **wishlist or maybe** job skipped with a reason (`too_senior`, `bad_pay`, `not_interested_company`, `wrong_location`, `other`); jobs already applied to, interviewing or at offer cannot be skipped |
| `start_run` | writes | like the UI's run button. `mode: resume_only` (default) only picks up inbox answers you gave; `drafts` also prepares tailored applications for wishlist jobs and queues them in the inbox for approval; `full` also discovers new roles first. Sends nothing. `drafts` and `full` use AI credits (Gemini) and fetch application pages, so they are **refused unless you set `MCP_ALLOW_DRAFT_RUNS=1`** in the server's environment (`.env.local`). Without it an agent can only run `resume_only` |

Deliberately **not** exposed: resolving/approving inbox items, sending email, filling or submitting forms, changing settings, marking a job as applied. A test pins the exact tool list.

## Untrusted text

Job postings and application-form questions are third-party text. The long free-text fields (job description, requirements, form question prompts) are returned under an `untrusted` key; short fields such as company name, job title and location are also scraped from third parties and are returned plainly. The tool descriptions tell the agent to treat all of it as data and never follow instructions found in it. This is a mitigation, not a guarantee: the real safety net is that the worst a hijacked agent can do is skip a not-yet-applied job or start a run, and a run only queues drafts for you to approve.

Error messages shown to the agent are limited to known cases (not found, run in progress, invalid input); anything else (for example a database error) is logged to the server's stderr only.

## Database

The server uses the same database as the web app (`DATABASE_URL` from `.env.local`). It refuses to start on the on-disk dev store (`DEV_DB_DIR`) because that store is single-process and the web UI could corrupt it. Set `MCP_ALLOW_DEV_STORE=1` only when no UI is running.

LINE MAN Wongnai's career page needs a browser to render: set `CHROMIUM_PATH` (for example Chrome's `chrome.exe`) in `.env.local`.
