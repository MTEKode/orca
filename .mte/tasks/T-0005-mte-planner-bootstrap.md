# T-0005 — M2: native MTE planner bootstrap (prompt + workspace MCP wiring + mte start)

Status: closed (VALIDATION_PASSED, attempt 1 + fix round; 2026-10-29)
Attempt: 1
Created: 2026-10-29
Epic: MTE native replan. Depends on T-0004 (`orca mte memory` MCP server) and
on the existing orchestration CLI surface (verified):
`orca orchestration {run-create,run-use,task-create,task-list,task-update,worker-start,worker-show,worker-read,worker-stop,ask,reply,inbox,send,check,coordinator-start,coordinator-stop,gate-create,gate-resolve}`.

## Context

The planner is an LLM agent chat session the user opens with ANY supported
agent CLI (locked: per-session agent choice). It needs three things natively:

1. A planner prompt (the MTE orchestrator role adapted to native verbs).
2. The memory MCP server (T-0004) reachable from that session — via
   project-scoped MCP config files, not launch-args surgery.
3. A one-command bootstrap: `orca mte start`.

Verified seams:

- `orca agent launch --agent <id> --prompt <text> --surface chat` (src/cli/specs/agent-launch.ts) opens an agent chat in a workspace.
- Claude Code reads project-scoped `.mcp.json` at the repo root.
- OpenCode reads project-scoped `opencode.json` (mcp key) at the repo root.
- Codex MCP servers live in `~/.codex/config.toml` (`mcp_servers` tables;
  ownership reader/writer machinery exists in `src/main/codex/config-toml-mcp-servers.ts`
  and `config-toml-runtime-owned-sections.ts`).

## In scope

1. `src/main/mte-flow/planner-prompt.ts` — planner system/kickoff prompt.
2. `src/main/mte-flow/mcp/workspace-mcp-config.ts` — per-workspace MCP config
   writers (claude `.mcp.json`, opencode `opencode.json`, codex global toml).
3. `orca mte start` CLI command (new spec in `src/cli/specs/mte.ts`, handler
   in `src/cli/handlers/mte.ts`).
4. Co-located tests.

## Out of scope

- Launch-level system-prompt injection (append-system-prompt seam) — v1
  carries the planner role inside the kickoff prompt; note as future work.
- Worker prompts (coder/validator personas) → T-0006 (validation loop) may
  add them via task spec text; workers follow the spec embedded in their task.
- UI panels, settings toggles, installer changes.

## Interfaces (exact)

### planner-prompt.ts

```ts
/** Stable planner persona + operating manual (English). */
export const MTE_PLANNER_PROMPT: string

/** First-message kickoff: persona + goal. */
export function plannerKickoffPrompt(goal: string): string
```

`MTE_PLANNER_PROMPT` MUST cover (assert in tests by substring):

- Role: Lead Architect; plans, never edits code outside `.mte/`.
- Requirement interrogation: numbered batches of 2-4; requirements lock replay
  before creating tasks.
- Memory tools (via MCP server `orca-mte-memory`): record_decision,
  get_decisions, supersede_decision, record_qa, search_memory, save_in_memory,
  get_pending_questions, answer_orq; orchestrator-only; workers ask via
  `orca orchestration ask`.
- Native loop: `run-create`/`run-use` → `task-create --spec <full task text>`
  (TaskRow is the source of truth; embed the complete spec in each task) →
  `coordinator-start` (or explicit `worker-start --agent <id> --task <id>`) →
  monitor via `worker-read`/`inbox` → answer worker questions with `reply` and
  persist the resolution with `record_qa`/`answer_orq` → validation via
  `check` + gates (`gate-create`/`gate-resolve`) → merging.
- Per-session worker agent choice: ask the user ONCE at session start which
  agent runs workers (claude/codex/cursor/antigravity/muse/zcode/opencode/
  opencode2); keep using it for every `worker-start --agent`.
- Never delete/rewrite git history; never push without the user's say-so.

### mcp/workspace-mcp-config.ts

```ts
export type WorkspaceMcpAdapter = 'claude' | 'opencode' | 'codex'

export type WorkspaceMcpPlan = {
  adapter: WorkspaceMcpAdapter
  /** Absolute path of the config file this adapter writes. */
  configPath: string
  /** JSON/TOML content or null when nothing to write (already correct). */
  nextContent: string | null
}

/** Idempotent plan for wiring the role-scoped memory server into one adapter. */
export function planWorkspaceMcpConfig(args: {
  adapter: WorkspaceMcpAdapter
  workspaceRoot: string
  orcaCliCommand: string // e.g. 'orca' or absolute path
  role: 'orchestrator' // planner surface (workers never get config)
}): WorkspaceMcpPlan

export function applyWorkspaceMcpConfig(plan: WorkspaceMcpPlan): Promise<void>
```

Shapes (server id `mte-memory`, stdio):

- claude — `<root>/.mcp.json`: `{ "mcpServers": { "mte-memory": { "command": "<orcaCliCommand>", "args": ["mte","memory","--role","orchestrator","--workspace","<root>"] } } }`.
  Merge with existing file preserving other servers; never reorder/drop
  foreign keys. If the entry exists byte-identical → `nextContent: null`.
- opencode — `<root>/opencode.json`: merge `"mcp": { "mte-memory": { "type": "local", "command": ["<orcaCliCommand>", "mte", "memory", "--role", "orchestrator", "--workspace", "<root>"] } }` preserving everything else (JSON; create if absent).
- codex — global `~/.codex/config.toml` via the existing TOML
  mcp_servers machinery: table `[mcp_servers.mte-memory]` with
  `command = "<orcaCliCommand>"`, `args = ["mte","memory","--role","orchestrator","--workspace","<root>"]`,
  `env` table absent. Reuse the repo's TOML scan/write helpers; treat other
  mcp_servers tables as untouchable. Global registration is accepted for
  codex (no project-scoped support) — the baked `--workspace` scopes it.

### CLI: `orca mte start`

- path appended to the existing `['mte']` group: `['mte','start']`.
- flags: `--agent <id>` (required; free string — validated by agent launch),
  `--workspace <path>` (optional; default `resolveMemoryWorkspaceRoot(process.cwd())`),
  `--goal <text>` (optional; default: interactive goal request text),
  `--adapter <claude|opencode|codex>` (optional; default `claude`),
  `--json`.
- Behavior: plan+apply the workspace MCP config for the chosen adapter (orcas
  CLI command resolved the same way other CLI self-references do — read how
  `runtimeOrchestrationCliCommand()` resolves and reuse; fall back to
  `process.argv[1]` when packaged), then delegate to the existing agent-launch
  machinery with `--prompt plannerKickoffPrompt(goal)` on the workspace
  root. Report: config written (or already-correct) + launch outcome receipt.
- If agent launch fails, exit non-zero with the receipt error; the MCP config
  may remain (idempotent rerun is fine).

## Constraints

All prior constraints (zero deps, English, no `as` except `as const`, oxfmt,
co-located tests). JSON merging must be surgical (stringify with 2-space
indent; preserve key order of existing files where feasible — parse, mutate,
serialize). No writes outside: `<root>/.mcp.json`, `<root>/opencode.json`,
`~/.codex/config.toml`.

## Acceptance criteria

1. `MTE_PLANNER_PROMPT` contains each required substring set (role, memory
   tool names, the orchestration verbs, per-session agent question, git
   safety); `plannerKickoffPrompt(goal)` embeds both the persona and the goal.
2. Claude plan: creates merged `.mcp.json` preserving a pre-existing foreign
   server; idempotent second run → `nextContent: null`; exact entry shape.
3. OpenCode plan: merges into existing `opencode.json` (arbitrary prior
   content preserved byte-wise for foreign keys); idempotent.
4. Codex plan: writes `[mcp_servers.mte-memory]` via existing TOML helpers on
   a fixture config containing other servers; those servers untouched;
   idempotent second plan → null.
5. `applyWorkspaceMcpConfig` round-trips each plan on a temp dir (and temp
   HOME for codex).
6. `orca mte start` handler: unit-tested against a faked launch seam —
   asserts prompt content passed, workspace flag, config applied before
   launch, non-zero exit on launch failure.
7. `orca mte start --help` renders (command-scoped help wired like `mte memory`).
8. Gates: targeted vitest (`src/main/mte-flow` + `src/cli`), `pnpm tc:node`,
   `pnpm tc:cli`, oxlint on touched files, repo-wide `oxfmt --check .` green.

## Validation commands

- `node config/scripts/run-vitest.mjs run --config config/vitest.config.ts src/main/mte-flow src/cli`
- `pnpm tc:node && pnpm tc:cli`
- `./node_modules/.bin/oxlint <touched files>` ; `./node_modules/.bin/oxfmt --check .`

## Fix instruction (pre-validation, orchestrator investigation 2026-10-29)

Coder attempt 1 flagged that `coordinator-start` is retired. Orchestrator
investigation confirmed the current model (evidence):

- `src/cli/specs/orchestration.ts` — `coordinator-start`/`coordinator-stop`
  (alias `run`/`run-stop`): "Retired: load the current orchestration skill",
  "performs no effects and returns the exact `skills get orchestration --full`
  recovery action", "Use the lightweight Run, Task, and worker-start
  primitives described by the current skill."
- The `orchestration.run` RPC (gates.ts) that spawns the Coordinator loop has
  NO CLI caller — the autonomous loop is not CLI-startable today.
- Current flow = planner-driven supervision: `run-create` → `task-create`
  → `worker-start --agent <id> --task <id>` → `inbox`/`worker-read` →
  `reply`/`send` → `check` → `gate-create`/`gate-resolve`.
- The native orchestration skill exists: `skills/orchestration/` +
  `skill-guides/orchestration.md` (`orca skills get orchestration --full`).

REQUIRED FIX in `planner-prompt.ts` (+ tests + criteria wording):

1. Remove `coordinator-start` from the loop wording entirely.
2. Replace with: dispatch via `worker-start --agent <id> --task <id>`;
   monitor via `inbox` and `worker-read`; convergence/health via
   `orchestration check`; gates via `gate-create`/`gate-resolve`.
3. Add one line: the planner should consult `orca skills get orchestration
   --full` once per session for the current primitive vocabulary.
4. Update `planner-prompt.test.ts` substring assertions accordingly; keep
   `.mte/` files oxfmt-clean.

## Run log

| Attempt | Agent                                     | Outcome                                                                                                                                                                                                                |
| ------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | mte-coder                                 | dispatched                                                                                                                                                                                                             |
| 1       | mte-coder                                 | TASK_READY_FOR_VALIDATION — 2273 tests green, tc node+cli green, oxfmt green. Deviations accepted (ORCA_CLI_COMMAND env override; coder formatted the spec file). Flagged: prompt teaches retired `coordinator-start`. |
| 1       | mte (orchestrator)                        | Investigated coordinator verb; fix instruction added above (pre-validation round, not a strike). Subagent quota exhausted mid-dispatch — fix round pending.                                                            |
| 1       | mte-coder (eco route: glm-5.3-flash-free) | Fix applied exactly per instruction — retired verb removed, current primitives + skills-get line in, tests updated. 78/78 mte-flow tests.                                                                              |
| 1       | mte-validator (eco route)                 | VALIDATION_PASSED — 2273 tests, tc node+cli, oxlint, repo-wide oxfmt, electron ratchet, scope, criteria 1-8 + fix-round requirements all green.                                                                        |

## Q&A log

- 2026-10-29 scope decision (orchestrator): launch-level `append-system-prompt`
  injection deferred; kickoff prompt carries the persona (v1). Codex gets a
  global MCP registration with baked `--workspace` (no project-scoped
  support) — acceptable per-session tradeoff, documented.
