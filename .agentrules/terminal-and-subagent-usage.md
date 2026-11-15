# Terminal and subagent usage

- **One terminal window per project**, started in that project's folder, so its own instructions,
  hooks and memory load. Do not drive several projects from one session.
- **One task per session**, kept short. When a session gets long or is compacted, finish or hand off
  and start a fresh one.
- **Two sessions on the same repo** must use separate git worktrees so they cannot overwrite each
  other's files.
- **Subagents are for side jobs inside the current project:** read-only fan-out (search, review,
  research) or a well-specified task on files nobody else is touching. Give them everything they need
  in the prompt, because they start cold. Do not use them for work spanning several projects or for
  tasks that need ongoing back-and-forth. Their report is a summary: verify claims against real files
  or a real command.
- **Hand off.** When stopping with unfinished work, leave a "next agent starts here" note (the task
  file, or your final message) so another tool can continue.
