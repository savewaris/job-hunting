// Shared helpers for the task-file gates. Plain Node, no dependencies, cross-platform.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

const EXEMPT_DIRS = ["docs/", ".claude/", ".agents/", ".agentrules/", ".github/"];
const EXEMPT_EXT = [".md", ".txt", ".json", ".yml", ".yaml", ".toml", ".ini", ".cfg"];
const EXEMPT_NAMES = [".gitignore", ".gitattributes", ".editorconfig", ".env.example"];

// Docs, markdown and config files never need a task file.
export function isExempt(relPath) {
  const p = relPath.split(sep).join("/");
  return EXEMPT_DIRS.some((d) => p.startsWith(d)) || EXEMPT_EXT.some((e) => p.endsWith(e)) || EXEMPT_NAMES.includes(p.split("/").pop());
}

export function projectRoot(cwd) {
  let dir = resolve(cwd || process.cwd());
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function currentBranch(root) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "HEAD";
  }
}

const section = (text, heading) => {
  const m = text.match(new RegExp(`^## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m"));
  return m ? m[1] : "";
};

// `- Label ...: value` with a real value (not empty, not a <placeholder>).
const fieldFilled = (sectionText, label) => {
  const m = sectionText.match(new RegExp(`^- ${label}[^:\\n]*:(.*)$`, "m"));
  const v = m ? m[1].trim() : "";
  return v !== "" && !/^<.*>$/.test(v);
};

export const beforeFilled = (text) => {
  const s = section(text, "Before starting");
  return fieldFilled(s, "Goal") && fieldFilled(s, "Acceptance criteria");
};

export const afterFilled = (text) => {
  const s = section(text, "After finishing");
  return fieldFilled(s, "Done") && fieldFilled(s, "Verified by");
};

const branchOf = (text) => (text.match(/^- Branch:(.*)$/m)?.[1] ?? "").trim();

// Task files (not templates) that apply to this branch. On main/master/detached HEAD any task file applies.
export function matchingTasks(root) {
  const dir = join(root, "docs", "tasks");
  if (!existsSync(dir)) return [];
  const branch = currentBranch(root);
  const anyBranch = ["main", "master", "HEAD"].includes(branch);
  return readdirSync(dir)
    .filter((n) => n.endsWith(".md") && !n.startsWith("_TEMPLATE"))
    .map((n) => ({ name: n, text: readFileSync(join(dir, n), "utf8"), mtime: statSync(join(dir, n)).mtimeMs }))
    .filter((t) => anyBranch || branchOf(t.text) === branch)
    .sort((a, b) => b.mtime - a.mtime);
}

export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

export const relPathOf = (root, filePath) => relative(root, resolve(root, filePath));
