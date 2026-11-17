# MCP server

A local stdio MCP server lets an AI agent (Claude Code or any MCP client) find jobs, inspect the pipeline and queue work. **Approving and sending stay in the web UI**: no tool can approve an inbox item, send an email, submit a form or change settings.

Run it: `npm run mcp` (stdio; all logs go to stderr). Connect a client with `.mcp.json.example` (copy it to `.mcp.json` and fix the path).

## Tools

| Tool | Effect | Notes |
|---|---|---|
| `get_status` | read | settings, job counts by status, open inbox count, last run |
| `list_jobs` | read | optional `status`, `bangkokOnly`, `limit` (default 20, max 100) |
| `get_job` | read | one job + 1-5 fit score; description (max 4000 chars) under `untrusted` |
| `list_inbox` | read | open questions/approvals/errors; text under `untrusted` |
| `funnel_metrics` | read | applied/response/interview/offer counts and rates |
| `discover_jobs` | writes new rows | scans the target companies' career pages, Bangkok first, max 50 new roles |
| `skip_job` | writes | marks a job skipped with a reason (`too_senior`, `bad_pay`, `not_interested_company`, `wrong_location`, `other`) |
| `start_run` | writes | discovers roles and queues drafted applications in the inbox for approval. Sends nothing. May use AI credits (Gemini) for cover letters |

Deliberately **not** exposed: resolving/approving inbox items, sending email, filling or submitting forms, changing settings, marking a job as applied. A test pins the exact tool list.

## Untrusted text

Job postings and application-form questions are third-party text. They are returned under an `untrusted` key and the tool descriptions tell the agent never to follow instructions found in them. This is a mitigation, not a guarantee: the real safety net is that the worst a hijacked agent can do is skip a job or start a run, and a run only queues drafts for you to approve.

## Database

The server uses the same database as the web app (`DATABASE_URL` from `.env.local`). It refuses to start on the on-disk dev store (`DEV_DB_DIR`) because that store is single-process and the web UI could corrupt it. Set `MCP_ALLOW_DEV_STORE=1` only when no UI is running.

LINE MAN Wongnai's career page needs a browser to render: set `CHROMIUM_PATH` (for example Chrome's `chrome.exe`) in `.env.local`.
