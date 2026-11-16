// Claude Code PreToolUse hook: no source edit without a filled-in task file for this branch.
// Exit 2 + stderr blocks the edit; anything unexpected is allowed so a broken hook never bricks a session.
import { EDIT_TOOLS, beforeFilled, isExempt, matchingTasks, projectRoot, readHookInput, relPathOf } from "./task-file.mjs";

const input = readHookInput();
if (!input || !EDIT_TOOLS.has(input.tool_name)) process.exit(0);

const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
const root = projectRoot(input.cwd);
if (!filePath || !root) process.exit(0);

const rel = relPathOf(root, filePath);
if (rel.startsWith("..") || isExempt(rel)) process.exit(0);

if (matchingTasks(root).some((t) => beforeFilled(t.text))) process.exit(0);

process.stderr.write(
  `Blocked: ${rel.split("\\").join("/")} is source code and there is no task file for this branch with "Before starting" filled in.\n` +
    "Copy docs/tasks/_TEMPLATE.md (or _TEMPLATE-small.md) to docs/tasks/<name>.md, set its Branch: line, " +
    "fill in Goal and Acceptance criteria, then retry the edit.\n"
);
process.exit(2);
