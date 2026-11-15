<!-- AGENT-KIT:BEGIN -->
## Working agreement (managed block; do not edit between the markers)

This block is maintained by the owner's agent-kit sync and is overwritten on the next sync. Put
repo-specific rules in `AGENTS.local.md`, or anywhere outside this block.

1. **Read first:** `.agents/INDEX.md` (the skills, agents, plugins and tools the owner uses, and
   which were used in this repo before), then the files in `.agentrules/`.
2. **Task file before edits (strict).** Before you edit any source file, create
   `docs/tasks/YYYY-MM-DD-<name>.md` from `docs/tasks/_TEMPLATE.md` (or `_TEMPLATE-small.md` for a
   tiny fix) and fill in its "Before starting" section: goal, acceptance criteria, how it will be
   proven. Docs, markdown and config edits are exempt so the task file itself can be written.
3. **Finish properly.** Before you stop, fill in "After finishing": what is done, what is not, how
   it was verified (the command and its real result), and **"next agent starts here"** so another
   tool can pick up where you stopped.
4. **Never push or merge to the default branch.** Work on a branch and open a pull request.
5. **Verify with real checks**, not a log line you wrote yourself.
6. **One question at a time** when a decision is the owner's; recommend an option.
7. **Backlog.** When the owner says "work on the plans", take the first `docs/backlog/*.md` whose `status`
   is `todo` (skip `_TEMPLATE.md`). Set `status: claimed`, `claimed_by` and `branch` in a commit on your own
   worktree branch, then follow rules 2-5. When you open the PR set `status: in-review` and `pr`. Never merge;
   never take a plan that is not `todo`.

Tools differ: Claude Code enforces rules 2 and 3 with hooks; other CLIs rely on you following them.
<!-- AGENT-KIT:END -->
