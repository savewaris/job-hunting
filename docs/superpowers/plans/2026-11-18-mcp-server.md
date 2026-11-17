# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local stdio MCP server that lets an AI agent find jobs, inspect the pipeline and queue work for human approval, while approving/sending stays impossible from MCP.

**Architecture:** `src/mcp/tools.ts` holds plain handler functions `(sql, input) => result` over existing domain code (testable with `createTestDb()`); `src/mcp/server.ts` registers them on an `@modelcontextprotocol/sdk` server over stdio. No tool approves, sends, fills forms, or changes settings; the UI stays the only approval surface (spec slice 2).

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` (new dependency, ^1.32.2) and its `zod` input schemas, tsx, vitest + in-memory PGlite.

**Spec:** `docs/superpowers/specs/2026-11-17-agentic-mcp-thai-finder-design.md` (slice 2 of 4).

## Global Constraints

- The MCP exposes exactly these tools and no others: `get_status`, `list_jobs`, `get_job`, `list_inbox`, `funnel_metrics`, `discover_jobs`, `skip_job`, `start_run`.
- Never expose: `resolveInboxItem`, `sendApplicationEmail`, any form submit, `updateSettings`, `moveApplication` to `applied`.
- stdout carries only MCP protocol messages; all logging goes to stderr (`console.error`).
- The server refuses to start on the on-disk PGlite store (`DEV_DB_DIR` set, `DATABASE_URL` unset) because PGlite is single-process and the web UI would corrupt it, unless `MCP_ALLOW_DEV_STORE=1`.
- Handlers return plain JSON-serialisable objects; bad input yields an MCP error result (`isError: true`) with a short message, never a stack trace.
- Domain code via `@/` alias; run tests with `npx vitest run --maxWorkers=4`.

## Review Focus

- A malformed or unknown `id` for `get_job` / `skip_job` returns a clean "not found" error, not a Postgres cast error (Task 1/2 tests).
- `list_jobs` limit is clamped (default 20, max 100) and `status` outside the known list is rejected (Task 1 test).
- `get_job` truncates description to 4000 characters so one huge posting cannot flood the agent's context (Task 1 test).
- `start_run` while a run is in progress returns the conflict as an error result, not a crash (Task 2 test).
- Nothing but protocol JSON reaches stdout, even when a handler logs (Task 3 smoke test).
- Starting on the dev PGlite store is refused with a clear stderr message (Task 3 test).

---

### Task 1: Read tools

**Files:**
- Modify: `package.json` (add dependency `@modelcontextprotocol/sdk`)
- Create: `src/mcp/tools.ts`, `tests/mcp/tools.test.ts`

**Interfaces:**
- Consumes: `listApplications`, `getSettings`, `listOpenInbox`, `listRecentRuns`, `computeMetrics`, `scoreFit`, `locationTier` (export from `@/domain/companies/discover`), `APPLICATION_STATUSES`, `NotFoundError`.
- Produces (all exported from `src/mcp/tools.ts`, signature `(sql: Sql, input) => Promise<result>`):
  - `getStatus(sql)` → `{ settings: Settings; byStatus: Record<ApplicationStatus, number>; openInbox: number; lastRun: Run | null }`
  - `listJobs(sql, { status?: ApplicationStatus; bangkokOnly?: boolean; limit?: number })` → `Array<{ id; companyName; jobTitle; location; status; source; jobUrl; createdAt }>`
  - `getJob(sql, { id: string })` → the job summary plus `description` (max 4000 chars), `requirements: string[]`, `fit: FitResult`; throws `NotFoundError` for unknown/invalid id
  - `listInbox(sql)` → `Array<{ id; kind; prompt; createdAt }>` for open items (read `InboxItem` in `src/domain/inbox/repo.ts` for field names)
  - `funnelMetrics(sql)` → `Metrics`

- [ ] **Step 1: Install** `npm install @modelcontextprotocol/sdk` (node_modules is a junction to the main checkout's, so this changes the shared install; commit only `package.json` and `package-lock.json`). Expected: package added, `npx tsc --noEmit -p .` still clean.
- [ ] **Step 2: Write failing tests** in `tests/mcp/tools.test.ts` using `createTestDb()` and `createApplication`:
  - `getStatus` counts a `wishlist` and a `skipped` app in `byStatus` and reports `openInbox: 0`.
  - `listJobs({ bangkokOnly: true })` returns only the app whose location is `'Bangkok, Thailand'`; `listJobs({ limit: 1000 })` returns at most 100; `listJobs({ status: 'bogus' as never })` rejects.
  - `getJob` of an app with a 6000-char description returns `description.length === 4000` and a `fit.score` between 1 and 5; `getJob({ id: 'not-a-uuid' })` and a random valid UUID both reject with `NotFoundError`.
  - `listInbox` returns an item created with `createInboxItem`; `funnelMetrics` returns `total` equal to the app count.
- [ ] **Step 3: Run** `npx vitest run tests/mcp/tools.test.ts` → Expected: FAIL (module missing).
- [ ] **Step 4: Implement the five handlers** in `src/mcp/tools.ts`; `getJob` reads `job_description` and `requirements` with one `sql.query` on `job_applications` (columns as in `src/domain/applications/repo.ts` `SELECT_COLS`/`Row`).
- [ ] **Step 5: Run** the test file → PASS; run `npx tsc --noEmit -p .` → clean.
- [ ] **Step 6: Commit** `feat(mcp): read tools over the existing domain`.

---

### Task 2: Queue-only write tools

**Files:**
- Modify: `src/mcp/tools.ts`, `tests/mcp/tools.test.ts`

**Interfaces:**
- Consumes: `discoverFromCompanyCareers(sql, maxNewRoles)`, `skipApplication(sql, id, reason, note?)`, `startRun(sql)`, `SKIP_REASONS`, `ConflictError`.
- Produces:
  - `discoverJobs(sql, { maxNewRoles?: number })` → `{ companiesScanned; discovered; skippedDuplicates; errors }`; `maxNewRoles` default 15, clamped 1..50
  - `skipJob(sql, { id: string; reason: SkipReason; note?: string })` → job summary with `status: 'skipped'`
  - `startRun(sql)` wrapper named `runPipeline(sql)` → `Run`; a `ConflictError` becomes an error the server reports as `isError`

- [ ] **Step 1: Write failing tests:**
  - `discoverJobs` with `fetch` spied to a Greenhouse response (pattern in `tests/domain/thaiDiscovery.test.ts`) and `maxNewRoles: 500` saves at most 50 and creates rows with status `wishlist`.
  - `skipJob` on a created app → `status === 'skipped'` and a `skip_reasons` row exists; unknown id → `NotFoundError`; reason `'bogus'` rejects.
  - `runPipeline` with a run already `running` (insert a `runs` row) rejects with `ConflictError`.
  - After `runPipeline` succeeds on an empty database, `SELECT count(*) FROM inbox_items WHERE status = 'answered'` is 0 and no email function is called (mock `@/lib/mailer` and assert `sendApplicationEmail` not called).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the three handlers, clamping `maxNewRoles` and validating `reason` against `SKIP_REASONS` before calling the repo.
- [ ] **Step 4: Run** `npx vitest run tests/mcp` → PASS.
- [ ] **Step 5: Commit** `feat(mcp): queue-only write tools (discover, skip, run)`.

---

### Task 3: Server wiring, safety guard, entrypoint

**Files:**
- Create: `src/mcp/server.ts`, `tests/mcp/server.test.ts`
- Modify: `package.json` (script `"mcp": "tsx src/mcp/server.ts"`)

**Interfaces:**
- Consumes: Task 1–2 handlers, `getDb()` from `@/lib/sql`, `scripts/loadEnv` (read how `scripts/migrate.ts` loads `.env.local`).
- Produces:
  - `createMcpServer(sql: Sql): McpServer` — registers exactly the eight tool names from Global Constraints with zod input shapes mirroring the handler inputs; handler errors become `{ isError: true, content: [{ type: 'text', text: <message> }] }`
  - `assertSafeStore(env: NodeJS.ProcessEnv): void` — throws when `DEV_DB_DIR` is set, `DATABASE_URL` is unset and `MCP_ALLOW_DEV_STORE !== '1'`
  - Running the file starts the server on `StdioServerTransport` against `getDb()`.

- [ ] **Step 1: Write failing tests** in `tests/mcp/server.test.ts`:
  - With the SDK's `InMemoryTransport.createLinkedPair()` and `Client`, `listTools()` names equal exactly the eight allowed names (sorted); none of `resolve_inbox`, `send_email`, `approve`, `update_settings`, `move_application` is present.
  - Calling `get_status` returns text content that parses as JSON with `byStatus`.
  - Calling `skip_job` with `id: 'nope'` returns `isError: true` and a message without the word "stack".
  - `assertSafeStore({ DEV_DB_DIR: '.dev-db' })` throws; `assertSafeStore({ DEV_DB_DIR: '.dev-db', MCP_ALLOW_DEV_STORE: '1' })` and `assertSafeStore({ DATABASE_URL: 'postgres://x' })` do not.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement `createMcpServer`, `assertSafeStore` and the entrypoint** (entrypoint only runs when the file is the main module; log with `console.error`).
- [ ] **Step 4: Smoke test over real stdio:** a vitest test spawns `npx tsx src/mcp/server.ts` with `MCP_ALLOW_DEV_STORE=1` and a temp `DEV_DB_DIR`, connects with the SDK `StdioClientTransport`, asserts `listTools` has 8 tools, and that every stdout line the transport saw parsed as JSON-RPC (the SDK errors otherwise). Mark with a 60s timeout.
- [ ] **Step 5: Run** `npx vitest run --maxWorkers=4` → full suite PASS; `npx tsc --noEmit -p .` clean.
- [ ] **Step 6: Commit** `feat(mcp): stdio server with safe-store guard`.

---

### Task 4: Connect it and document it

**Files:**
- Create: `docs/mcp.md`, `.mcp.json.example`
- Modify: `CLAUDE.md` (one line under Commands: `npm run mcp`)

**Interfaces:**
- Produces: `.mcp.json.example` with a `job-hunting` server entry (`command: "npm"`, `args: ["run","mcp","--silent"]`, `cwd` placeholder) and `docs/mcp.md` listing the eight tools, what each may and may not do, the dev-store restriction, and that approval stays in the UI.

- [ ] **Step 1: Write the two docs** from the tool list and constraints above (no new behavior).
- [ ] **Step 2: Verify with a real client:** with the dev server stopped, run the Task 3 smoke test once more and, if Claude Code is available, `claude mcp add` the example entry and call `get_status`; record the result. Expected: eight tools listed, `get_status` returns JSON.
- [ ] **Step 3: Commit** `docs(mcp): tool list, safety rules and client config`.

---

## Self-review

- Spec slice 2: MCP stdio server over domain code (Tasks 1-3), no approve tool (Global Constraints + Task 3 test), docs (Task 4). Autonomy switches and monitor UI are slice 3, not here.
- Names consistent: handler names (`getStatus`, `listJobs`, `getJob`, `listInbox`, `funnelMetrics`, `discoverJobs`, `skipJob`, `runPipeline`) map to tool names (`get_status`, `list_jobs`, `get_job`, `list_inbox`, `funnel_metrics`, `discover_jobs`, `skip_job`, `start_run`).
- Known gaps: `start_run` may call Gemini during drafting (AI cost); tool inputs are not authenticated (stdio, local-only by design); the agent can queue and skip but cannot mark a job applied.
