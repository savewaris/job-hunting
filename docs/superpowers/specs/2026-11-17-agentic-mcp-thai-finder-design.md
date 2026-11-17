# Agentic job-hunting: MCP-first, Thai/Bangkok finder, monitor UI

Status: DRAFT, awaiting approval (nothing built).
Research: `reports/Agentic job hunting offer strategies.md`, `reports/Profile sync LinkedIn Fastwork.md`.

## Intent and why
The owner (software developer, Bangkok) wants AI agents to run the job hunt: find jobs (Thai/Bangkok first), apply properly, later keep profiles fresh and raise offer odds. Their personal bottleneck is interviews/offers, but they chose to get **auto-apply working properly first**. Budget for AI credits is very small, so deterministic code is preferred over LLM calls. The web UI becomes a **monitor + approval surface for the human**; the primary interface is an **MCP server for agents**.

## Goals
- Agents (Claude Code etc.) can drive the whole pipeline through MCP tools.
- Jobs in Bangkok/Thai are discovered and ranked daily.
- Every outbound action is prepared by the agent and, at first, approved by the human; each action type can later be switched to auto.
- UI shows what the agent did, what waits for approval, funnel metrics.

## Non-goals
- No LinkedIn automation of any kind (its user agreement bans bots). LinkedIn/Fastwork profile changes stay draft-and-apply-by-hand.
- No JobsDB scraping (terms ban robots/screen scraping).
- No mass auto-apply, no CAPTCHA solving.
- No new LLM-heavy features; LLM only where code cannot do it (tailoring drafts, messy posting parsing, novel screening answers).

## Anti-goals (failure even if it "works")
- An agent approving or sending its own work while the type is set to approve-first.
- Emails with wrong company, fabricated experience, placeholders (existing fact-check gate must stay in front of every send).
- Account bans or ToS breaches on a platform.

## Constraints
- Local-only security model stays (127.0.0.1, middleware guard, RLS no anon).
- One database (Postgres/PGlite) via `src/lib/sql.ts`; domain code in `src/domain/*`.
- Windows machine; owner's AI budget is minimal.

## Approaches considered
**MCP server**
- A. Local stdio MCP in this repo importing `src/domain` directly (chosen). No web server needed; UI and MCP share the DB.
- B. MCP wrapping the Next.js API: less code, breaks when dev server is down.
- C. Separate service: too heavy for a single-user local tool.

**Thai job sources**
- Bangkok companies' own career pages / ATS boards (Greenhouse/Lever/Ashby already supported) - safe.
- Parse JobsDB/JobThai alert emails already arriving in the owner's Gmail - no scraping, no AI needed (my call; email access rules to be settled in slice 1).
- Existing Facebook group scraper - needs its own ToS/safety check before being relied on.
- JobsDB scraping - rejected (terms).

## Design
1. **MCP server (`src/mcp/`, stdio)** exposing tools such as: `search_jobs`, `list_inbox`, `get_job`, `draft_application`, `queue_action`, `get_status`, `funnel_metrics`. Tools call existing repo functions. Tools can create drafts and queue actions; there is **no tool that approves**.
2. **Autonomy levels** stored in `app_settings`: per action type (`apply_email`, `form_fill`, `followup`, `profile_draft`...) = `approve` (default) | `auto` with a daily cap. Only the UI/settings API can change them (not exposed over MCP). The send path checks the level and the fact-check gate server-side, so it holds even if an agent misbehaves.
3. **UI** reframed as monitor: activity feed of agent actions, approval queue, autonomy switches, funnel (found -> applied -> reply -> interview -> offer).
4. **Thai finder**: deterministic keyword/location (Bangkok, Thai-language terms) matching and ranking; dedupe with existing company+title logic.

## Slices and order (my proposal)
1. Thai/Bangkok finder (sources above) - answers the owner's first complaint.
2. MCP server over existing domain functions.
3. Autonomy levels + monitor-UI reframe.
4. Auto-apply reliability (live form-fill testing per `reports/Live testing ATS form fill.md`), then profile-draft helpers and interview/offer tools.

## Left to the builder
Exact MCP tool schemas, ranking weights, Gmail alert parsing format, UI layout, test strategy per slice. Each slice gets its own plan.

## Open items / risks
- Full JobsDB/JobThai terms unread; Thai-law check advised before any automation there.
- Gmail access method (existing mailer vs. Gmail connector) undecided.
- Facebook scraper ToS unchecked.
- Existing fact-check gate not audited in depth.

## Calls I made (not agreed by owner)
Stdio MCP, UI-only autonomy changes, slice order, Gmail-alert idea, and skipping a separate builder review to save AI cost.
