# How we work

A short summary for people and agents. The binding rules are in `AGENTS.md` and `.agentrules/`.

- Work happens on a branch and lands through a pull request that the owner reviews and merges.
  Nothing is pushed or merged to the default branch automatically.
- Every change starts with a task file in `docs/tasks/` (goal, acceptance criteria, how it will be
  proven) and ends with what was verified and where the next agent should start.
- One terminal per project, one task per session, and a separate git worktree if two sessions share
  a repo.
- "Done" means verified with a real check: tests, build and a real request or command, not a claim.
- Which skills, agents, plugins and tools the owner uses, and which were used in this repo before, is
  listed in `.agents/INDEX.md`.
