# Git workflow

- Never push or merge directly to the default branch. Use a branch (`feat/<name>`, `fix/<name>`,
  `docs/<name>`) and open a pull request for the owner to merge.
- Use Conventional Commits: `<type>(<scope>): <subject>` with `feat`, `fix`, `docs`, `refactor`,
  `test`, `chore`, and so on.
- Check `git status` before pushing. If the remote has new commits, `git pull --rebase` first.
- Never commit secrets, tokens or `.env` files, and never leave conflict markers in files.
- When creating issues or PRs with the `gh` CLI, write the body to a temporary file and pass
  `--body-file`; do not pass multi-line markdown inline.
- Do not overwrite or discard uncommitted work you did not create. Use a separate git worktree when
  another session is already working in the same repo.
