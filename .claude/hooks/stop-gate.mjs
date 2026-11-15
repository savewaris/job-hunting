// Claude Code Stop hook: if this session edited a source file, the task file's "After finishing"
// section must be filled in before Claude stops. Docs-only sessions are exempt (same as the pre-edit gate).
import { readFileSync } from "node:fs";
import { EDIT_TOOLS, afterFilled, isExempt, matchingTasks, projectRoot, readHookInput, relPathOf } from "./task-file.mjs";

const input = readHookInput();
// stop_hook_active means Claude was already sent back once; never loop.
if (!input || input.stop_hook_active) process.exit(0);

const root = projectRoot(input.cwd);
if (!root) process.exit(0);

function editedSource() {
  let text;
  try {
    text = readFileSync(input.transcript_path, "utf8");
  } catch {
    return false;
  }
  for (const line of text.split("\n")) {
    if (!line.includes('"tool_use"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    for (const block of entry.message?.content ?? []) {
      if (block?.type !== "tool_use" || !EDIT_TOOLS.has(block.name)) continue;
      const p = block.input?.file_path ?? block.input?.notebook_path;
      if (!p) continue;
      const rel = relPathOf(root, p);
      if (!rel.startsWith("..") && !isExempt(rel)) return true;
    }
  }
  return false;
}

if (!editedSource()) process.exit(0);
if (matchingTasks(root).some((t) => afterFilled(t.text))) process.exit(0);

process.stderr.write(
  'Blocked: this session edited source files but the task file\'s "After finishing" section is not filled in.\n' +
    'Fill in "Done" and "Verified by" (the command and its real result) in docs/tasks/<name>.md, then stop.\n'
);
process.exit(2);
