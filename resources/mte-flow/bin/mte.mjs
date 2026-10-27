#!/usr/bin/env node
// mte.mjs — MTE Flow runtime CLI: detect checks, validate, memory.
//
// Usage:
//   node mte.mjs detect
//   node mte.mjs validate              # env MTE_VALIDATE_TIMEOUT (s, def 600),
//                                     #     MTE_VALIDATE_TAIL (lines, def 50)
//   node mte.mjs memory search <query>
//   node mte.mjs memory save <type> <slug> "<text>"
//   node mte.mjs memory index | status
//   node mte.mjs memory export [--format md|json] [--out <file>]
//   node mte.mjs session save | list | resume [--id S-…] | state
//   node mte.mjs --help | <cmd> --help    Exit codes: 0 ok, 1 runtime, 2 usage;
//                                         validate exits with the failing-group count.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HELP = `Usage: node mte.mjs <command> [args]

Commands:
  detect                          print LINT=, TYPECHECK=, TEST= detected commands
  validate                        run detected checks; env MTE_VALIDATE_TIMEOUT (s),
                                  MTE_VALIDATE_TAIL (lines per failing check)
  memory search <query>           search the notes in .mte/memory/
  memory save <type> <slug> <txt> save note; type: project|decision|incident|reference
  memory index | status           rebuild MEMORY.md | show notes state
  memory export [--format md|json] [--out <file>]
                                  render all notes as one markdown doc or JSON
  session save                    snapshot stdin narrative + machine facts
  session list                    list session snapshots in .mte/sessions/
  session resume [--id S-…]       print the resume brief (default: newest snapshot)
  session state                   print the live machine facts
  --help | <cmd> --help           show this help

Exit codes: 0 success, 1 runtime error, 2 usage error; validate exits with the failing count.`;

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function usageError(msg) {
  console.error(`${msg}\n\n${HELP}`);
  process.exit(2);
}

// ---------- shared helpers ----------

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null; // missing or unreadable -> treat as absent
  }
}

function utcStamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function commandExists(cmd) {
  const probe = process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
  return spawnSync(probe, { shell: true, stdio: "ignore" }).status === 0;
}

// Root = nearest ancestor of `start` (or start itself) holding .git (dir or file) or .mte.
function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git")) || fs.existsSync(path.join(dir, ".mte"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

// ---------- detect ----------

const ESLINT_CONFIGS = [
  "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts",
  ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml",
];

function hasBin(root, name) {
  const bin = path.join(root, "node_modules", ".bin", name);
  return fs.existsSync(bin) || (process.platform === "win32" && fs.existsSync(`${bin}.cmd`));
}

function fileMatches(root, name, regex) {
  const text = readText(path.join(root, name));
  return text !== null && regex.test(text);
}

function detectChecks(root) {
  const p = (rel) => path.join(root, rel);
  const has = (rel) => fs.existsSync(p(rel));
  let lint = "none", typecheck = "none", test = "none";

  if (has("package.json")) {
    let scripts = {};
    try { scripts = JSON.parse(readText(p("package.json"))).scripts ?? {}; } catch { /* treat as absent */ }
    if (scripts.lint) lint = "npm run lint";
    if (lint === "none" && ESLINT_CONFIGS.some(has) && hasBin(root, "eslint")) lint = "npx --no-install eslint .";
    if (scripts.typecheck) typecheck = "npm run typecheck";
    if (typecheck === "none" && has("tsconfig.json") && hasBin(root, "tsc")) typecheck = "npx --no-install tsc --noEmit";
    if (scripts.test) test = "npm test";
  } else if (has("pyproject.toml") || has("setup.py") || has("setup.cfg")) {
    const mypy = fileMatches(root, "pyproject.toml", /^\[tool\.mypy\]/m);
    if (has("uv.lock") && commandExists("uv")) {
      lint = "uv run ruff check .";
      test = "uv run pytest -q";
      if (mypy) typecheck = "uv run mypy .";
    } else {
      if (commandExists("ruff")) lint = "ruff check .";
      if (commandExists("pytest")) test = "pytest -q";
      if (mypy && commandExists("mypy")) typecheck = "mypy .";
    }
  } else if (has("go.mod")) {
    lint = "go vet ./...";
    if ((has(".golangci.yml") || has(".golangci.yaml")) && commandExists("golangci-lint")) lint = "golangci-lint run";
    test = "go test ./...";
  } else if (has("Cargo.toml")) {
    if (commandExists("cargo-clippy")) lint = "cargo clippy --quiet -- -D warnings";
    else if (commandExists("cargo-fmt")) lint = "cargo fmt --check";
    test = "cargo test --quiet";
  }

  if (lint === "none" && fileMatches(root, "Makefile", /^lint:/m)) lint = "make lint";
  if (test === "none" && fileMatches(root, "Makefile", /^test:/m)) test = "make test";
  return { lint, typecheck, test };
}

function cmdDetect(root) {
  const { lint, typecheck, test } = detectChecks(root);
  console.log(`LINT=${lint}\nTYPECHECK=${typecheck}\nTEST=${test}`);
}

// ---------- validate ----------

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Run one check. Output goes to a temp log so a timeout-killed shell cannot
// leave orphaned children holding our pipes open (spawnSync would stall on them).
function runCheck(label, cmd, root, timeoutSecs, tailLines) {
  if (cmd === "none") {
    console.log(`  ${label.padEnd(12)} SKIP (not configured for this stack)`);
    return 0;
  }
  const log = path.join(os.tmpdir(), `mte-validate-${process.pid}-${label}.log`);
  const res = spawnSync(`${cmd} > "${log}" 2>&1`, {
    shell: true, cwd: root, timeout: timeoutSecs * 1000, stdio: "ignore",
  });
  const timedOut = res.error?.code === "ETIMEDOUT" || res.signal === "SIGTERM";
  const output = [readText(log) ?? "", res.error ? String(res.error) : ""].join("").trimEnd();
  try { fs.rmSync(log, { force: true }); } catch { /* best effort */ }
  if (res.status === 0 && !res.error) {
    console.log(`  ${label.padEnd(12)} PASS  (${cmd})`);
    return 0;
  }
  const note = timedOut ? ` (timed out after ${timeoutSecs}s)` : "";
  console.log(`  ${label.padEnd(12)} FAIL  (${cmd})${note}`);
  console.log(`  ---- ${cmd} (first ${tailLines} lines) ----`);
  for (const line of (output ? output.split(/\r?\n/) : []).slice(0, tailLines)) console.log(`  ${line}`);
  console.log("  -----------------------------------------");
  return 1;
}

function cmdValidate(root) {
  const timeoutSecs = envInt("MTE_VALIDATE_TIMEOUT", 600);
  const tailLines = envInt("MTE_VALIDATE_TAIL", 50);
  console.log(`=== mte validate: ${utcStamp()} ===`);
  const det = detectChecks(root);
  const failing =
    runCheck("lint", det.lint, root, timeoutSecs, tailLines) +
    runCheck("typecheck", det.typecheck, root, timeoutSecs, tailLines) +
    runCheck("test", det.test, root, timeoutSecs, tailLines);
  console.log();
  console.log(failing === 0 ? "VALIDATION_RESULT: PASS" : `VALIDATION_RESULT: FAIL (${failing} failing group(s))`);
  process.exitCode = failing;
}

// ---------- memory ----------

const VALID_TYPES = ["project", "decision", "incident", "reference"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function memPaths(root) {
  const memDir = path.join(root, ".mte", "memory");
  return { memDir, index: path.join(memDir, "MEMORY.md") };
}

function memInit(root) {
  const paths = memPaths(root);
  for (const dir of [paths.memDir, path.join(root, ".mte", "tasks")]) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(paths.index)) fs.writeFileSync(paths.index, "# Project Memory\n\n");
  return paths;
}

function listMarkdown(memDir) {
  if (!fs.existsSync(memDir)) return [];
  return fs.readdirSync(memDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(memDir, entry.name))
    .sort();
}

function entryFiles(memDir) {
  return listMarkdown(memDir).filter((file) => path.basename(file) !== "MEMORY.md");
}

// First non-empty line after the frontmatter, truncated to 100 chars.
function firstContentLine(file) {
  const lines = (readText(file) ?? "").split(/\r?\n/);
  let inFrontmatter = lines[0] === "---";
  for (let i = inFrontmatter ? 1 : 0; i < lines.length; i++) {
    if (inFrontmatter) {
      if (lines[i] === "---") inFrontmatter = false;
    } else if (lines[i].trim() !== "") {
      return lines[i].slice(0, 100);
    }
  }
  return "";
}

function indexLine(slug, file) {
  return `- [${slug}](${slug}.md) - ${firstContentLine(file)}`;
}

function memSave(root, args) {
  const [type, slug, ...rest] = args;
  if (type === undefined || slug === undefined || rest.length === 0) {
    usageError('memory save takes: <type> <slug> "<text>"');
  }
  if (!VALID_TYPES.includes(type)) die(`type must be one of: ${VALID_TYPES.join("|")}`);
  if (!SLUG_RE.test(slug)) die("slug must be kebab-case (a-z, 0-9, -)");
  const { memDir, index } = memInit(root);
  const file = path.join(memDir, `${slug}.md`);
  if (fs.existsSync(file)) die(`entry '${slug}' already exists — pick another slug or edit ${toPosix(file)}`);
  const entry = `---\nname: ${slug}\ntype: ${type}\ndate: ${utcStamp()}\n---\n\n${rest.join(" ")}\n`;
  try {
    fs.writeFileSync(file, entry);
    const lines = (readText(index) ?? "# Project Memory\n\n")
      .split(/\r?\n/)
      .filter((line) => !line.startsWith(`- [${slug}](${slug}.md)`));
    lines.push(indexLine(slug, file));
    fs.writeFileSync(index, `${lines.join("\n").replace(/\s+$/, "")}\n`);
  } catch (err) { die(err instanceof Error ? err.message : String(err)); }
  console.log(`saved: ${toPosix(path.relative(root, file))}`);
}

function memIndex(root) {
  const { memDir, index } = memInit(root);
  const files = entryFiles(memDir);
  const lines = ["# Project Memory", "", ...files.map((file) => indexLine(path.basename(file, ".md"), file))];
  try {
    fs.writeFileSync(index, `${lines.join("\n")}\n`);
  } catch (err) { die(err instanceof Error ? err.message : String(err)); }
  console.log(`indexed ${files.length} entries into ${toPosix(path.relative(root, index))}`);
}

function memStatus(root) {
  const { memDir } = memPaths(root);
  console.log(`notes:      ${entryFiles(memDir).length} entries in .mte/memory/`);
}

function memSearch(root, args) {
  if (args.length !== 1) usageError("memory search takes exactly one query string");
  const query = args[0];
  const { memDir } = memPaths(root);
  console.log("=== NOTE MEMORY (.mte/memory) ===");
  const needle = query.toLowerCase();
  let hits = 0;
  for (const file of listMarkdown(memDir)) {
    const rel = toPosix(path.relative(memDir, file));
    (readText(file) ?? "").split(/\r?\n/).forEach((line, i) => {
      if (line.toLowerCase().includes(needle)) {
        console.log(`${rel}:${i + 1}: ${line}`);
        hits += 1;
      }
    });
  }
  if (hits === 0) console.log("(no note matches — memory may be empty for this topic)");
}

// Parse one entry file (frontmatter name/type/date + body). Null when unreadable
// or malformed — export skips those instead of failing.
function parseEntry(file) {
  const lines = (readText(file) ?? "").split(/\r?\n/);
  const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  if (end === -1) return null;
  const meta = {};
  for (const line of lines.slice(1, end)) {
    const colon = line.indexOf(":");
    if (colon > 0) meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  if (!meta.name || !meta.type || !meta.date) return null;
  return { slug: meta.name, type: meta.type, date: meta.date, text: lines.slice(end + 1).join("\n").trim() };
}

// All entries in MEMORY.md index order (unindexed entry files appended in name
// order); content is read from the .md files on disk.
function memEntries(root) {
  const { memDir, index } = memPaths(root);
  const names = (readText(index) ?? "").split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*\[[^\]]*\]\(([^)]+\.md)\)/)?.[1])
    .filter(Boolean)
    .map((link) => path.basename(link));
  names.push(...entryFiles(memDir).map((file) => path.basename(file)));
  return [...new Set(names)]
    .filter((base) => base !== "MEMORY.md")
    .map((base) => parseEntry(path.join(memDir, base)))
    .filter((entry) => entry !== null);
}

function memExport(root, args) {
  let format = "md", out;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg !== "--format" && arg !== "--out") usageError("memory export takes: [--format md|json] [--out <file>]");
    const value = args[++i];
    if (value === undefined) usageError(`${arg} requires a value`);
    if (arg === "--format") format = value;
    else out = value;
  }
  if (format !== "md" && format !== "json") usageError(`--format must be md or json, got '${format}'`);
  const entries = memEntries(root);
  const doc = format === "json"
    ? JSON.stringify({ entries }, null, 2)
    : entries.length === 0
      ? "# Project Memory\n\n(no entries)"
      : `# Project Memory\n\n${entries.map((e) => `## ${e.slug}\n- type: ${e.type}\n- date: ${e.date}\n\n${e.text}`).join("\n\n")}`;
  try {
    if (out === undefined) console.log(doc);
    else fs.writeFileSync(path.resolve(out), `${doc}\n`);
  } catch (err) { die(err instanceof Error ? err.message : String(err)); }
}

// ---------- session ----------

const NARRATIVE_HEADING = "## Session narrative (from the handing-off agent)";
const FACTS_HEADING = "## Machine facts (at save time)";

function readStdin() {
  try { return fs.readFileSync(0, "utf8"); } catch { return ""; }
}

function gitRun(root, args) {
  const res = spawnSync(`git ${args}`, { shell: true, cwd: root, timeout: 10000, encoding: "utf8" });
  return res.status === 0 && !res.error ? (res.stdout ?? "").trim() : null;
}

// Git facts degrade to "unknown" when git is absent or the root is not a repo.
function gitFacts(root) {
  const dirty = gitRun(root, "status --porcelain")?.split(/\r?\n/).filter((line) => line !== "") ?? null;
  return {
    branch: gitRun(root, "rev-parse --abbrev-ref HEAD") ?? "unknown",
    head: gitRun(root, "rev-parse --short HEAD") ?? "unknown",
    modified: dirty === null ? "unknown" : dirty.filter((line) => !line.startsWith("??")).length,
    untracked: dirty === null ? "unknown" : dirty.filter((line) => line.startsWith("??")).length,
  };
}

// Task spec -> board facts: id, title (first heading), status, last run-log line.
function taskFacts(file) {
  const lines = (readText(file) ?? "").split(/\r?\n/);
  const title = (lines.find((line) => line.startsWith("# ")) ?? path.basename(file, ".md"))
    .replace(/^# +/, "").replace(/^Task T-\d+:\s*/, "");
  const start = lines.findIndex((line) => /^## Run log\s*$/.test(line));
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  const log = start === -1 ? [] : lines.slice(start + 1, end === -1 ? undefined : end);
  return {
    id: path.basename(file).match(/^T-\d{4}/)[0],
    title,
    closed: log.some((line) => line.includes("-> closed")),
    last: [...log].reverse().find((line) => line.trim() !== "") ?? "(no run log entries)",
  };
}

// The three Machine facts sections computed live; embedded in snapshots too.
function machineFacts(root, git = gitFacts(root)) {
  const tasksDir = path.join(root, ".mte", "tasks");
  const names = fs.existsSync(tasksDir)
    ? fs.readdirSync(tasksDir).filter((name) => /^T-\d{4}(-[^.]*)?\.md$/.test(name)).sort()
    : [];
  const board = ["### Task board"];
  if (names.length === 0) board.push("- (no tasks yet)");
  for (const name of names) {
    const t = taskFacts(path.join(tasksDir, name));
    board.push(`- ${t.id} ${t.title} — ${t.closed ? "closed" : "open"}`, `  last: ${t.last}`);
  }
  const entries = memEntries(root);
  const memory = entries.length === 0 ? "0 entries"
    : `${entries.length} entries: ${entries.map((e) => e.slug).join(", ")}`;
  return `${board.join("\n")}\n\n### Memory\n${memory}\n\n### Git\n`
    + `branch ${git.branch} @ ${git.head}, ${git.modified} modified / ${git.untracked} untracked files`;
}

function sessSave(root) {
  const narrative = readStdin();
  if (narrative.trim() === "") die("no narrative on stdin");
  const sessDir = path.join(root, ".mte", "sessions");
  fs.mkdirSync(sessDir, { recursive: true });
  const now = new Date();
  const git = gitFacts(root);
  const iso = now.toISOString();
  const id = `S-${iso.slice(0, 10).replace(/-/g, "")}-${iso.slice(11, 19).replace(/:/g, "")}`;
  const content = [
    "---", `id: ${id}`, `date: ${utcStamp(now)}`, `branch: ${git.branch}`, `head: ${git.head}`,
    "---", "", NARRATIVE_HEADING, "", narrative, "", FACTS_HEADING, "", machineFacts(root, git), "",
  ].join("\n");
  const file = path.join(sessDir, `${id}.md`);
  try { fs.writeFileSync(file, content); } catch (err) { die(err instanceof Error ? err.message : String(err)); }
  console.log(`saved: ${toPosix(path.relative(root, file))}`);
}

// Snapshot file -> { id, date, first } where first = first non-empty narrative line.
function parseSnapshot(file) {
  const lines = (readText(file) ?? "").split(/\r?\n/);
  const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  if (end === -1) return null;
  const meta = {};
  for (const line of lines.slice(1, end)) {
    const colon = line.indexOf(":");
    if (colon > 0) meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  const start = lines.indexOf(NARRATIVE_HEADING);
  const stop = lines.indexOf(FACTS_HEADING, start + 1);
  const first = start === -1 ? "" : lines.slice(start + 1, stop === -1 ? undefined : stop)
    .find((line) => line.trim() !== "") ?? "";
  return { id: meta.id ?? path.basename(file, ".md"), date: meta.date ?? "", first, file };
}

function listSnapshots(root) {
  const dir = path.join(root, ".mte", "sessions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => parseSnapshot(path.join(dir, entry.name)))
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function sessList(root) {
  const snaps = listSnapshots(root);
  if (snaps.length === 0) return console.log("no snapshots yet");
  snaps.forEach((snap) => console.log(`${snap.id}  ${snap.date}  ${snap.first}`));
}

function sessResume(root, args) {
  let id;
  if (args.length === 1 && args[0] === "--id") usageError("--id requires a value");
  if (args.length === 2 && args[0] === "--id") id = args[1];
  else if (args.length > 0) usageError("session resume takes: [--id S-YYYYMMDD-HHMMSS]");
  const snaps = listSnapshots(root);
  if (snaps.length === 0) return console.log("no snapshots found in .mte/sessions/");
  const snap = id === undefined ? snaps[snaps.length - 1] : snaps.find((s) => s.id === id);
  if (snap === undefined) die(`snapshot ${id} not found`);
  console.log([
    "=== RESUME BRIEF ===",
    "(You are resuming a previous agent's session on this project. Read the",
    "snapshot, compare it with the live state below, reconcile drift, then",
    "continue where it left off. If the snapshot records an accepted requirements",
    "lock, inherit it — do not re-grill.)",
    "",
    `--- snapshot ${snap.id} ---`,
    (readText(snap.file) ?? "").trimEnd(),
    "",
    "--- live state (now) ---",
    machineFacts(root).trimEnd(),
    "",
    "=== END RESUME BRIEF ===",
  ].join("\n"));
}

function runSession(root, sub, args) {
  const actions = {
    save: () => sessSave(root),
    list: () => sessList(root),
    resume: () => sessResume(root, args),
    state: () => console.log(machineFacts(root).trimEnd()),
  };
  if (sub === undefined) usageError("session requires a subcommand: save|list|resume|state");
  if (!(sub in actions)) usageError(`unknown session subcommand '${sub}' (valid: save|list|resume|state)`);
  actions[sub]();
}

// ---------- dispatch ----------

function runMemory(root, sub, args) {
  const actions = {
    search: () => memSearch(root, args),
    save: () => memSave(root, args),
    index: () => memIndex(root),
    status: () => memStatus(root),
    export: () => memExport(root, args),
  };
  if (sub === undefined) usageError("memory requires a subcommand: search|save|index|status|export");
  if (!(sub in actions)) usageError(`unknown memory subcommand '${sub}' (valid: search|save|index|status|export)`);
  actions[sub]();
}

function main() {
  const [cmd, sub] = process.argv.slice(2);
  const helpish = (value) => value === "-h" || value === "--help" || value === "help";
  if (helpish(cmd) || (sub !== undefined && helpish(sub) && ["detect", "validate", "memory", "session"].includes(cmd))) {
    console.log(HELP);
    return;
  }
  const root = findRoot();
  if (cmd === "detect") return cmdDetect(root);
  if (cmd === "validate") return cmdValidate(root);
  if (cmd === "memory") return runMemory(root, sub, process.argv.slice(4));
  if (cmd === "session") return runSession(root, sub, process.argv.slice(4));
  usageError(`unknown command '${cmd ?? ""}'`);
}

main();
