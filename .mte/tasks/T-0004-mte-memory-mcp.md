# T-0004 — M1: native memory MCP server (orca CLI) + workspace resolution

Status: closed (VALIDATION_PASSED, attempt 1 round 2; shipped in commit ca2d5cbdb1)
Attempt: 1
Created: 2026-10-29
Epic: MTE native replan. Depends on T-0003 (merged upstream). Extends the
T-0001/T-0002 memory layer. Per-session agent-config injection is T-0005
scope; this task delivers the role-scoped MCP surface itself.

## Context

MTE becomes orca's native orchestration brain. The planner (an LLM agent
session) must reach the structured memory (`.mte/memory.db`) through real
tools with structural role gating. Orca has no in-process MCP host, so the
standard pattern applies: agent CLIs (Claude Code, Codex, OpenCode) can spawn
an MCP **stdio** server — implemented here as an `orca` CLI subcommand using
the existing `CommandSpec` registry (`src/cli/command-spec.ts`,
`src/cli/dispatch.ts`). The T-0002 layer already enforces roles
(`createMemoryToolHandlers(store, role)` filters both `tools` and `execute`).

Locked decisions that apply: memory is orchestrator-planner-owned; workers
never read it directly; mte.mjs dies (this server is its native replacement
surface); zero new dependencies.

## In scope

1. `src/main/mte-flow/memory-workspace-root.ts` — workspace root resolution.
2. `src/main/mte-flow/mcp/memory-mcp-server.ts` — minimal MCP stdio server
   (pure function over streams, testable without spawning).
3. CLI command `orca mte memory` wired into the command registry.
4. Co-located tests.

## Out of scope

- Agent-config injection (claude profile / codex toml / opencode) → T-0005.
- MemoryService singleton in the Electron main process → T-0005/T-0006.
- MCP resources/prompts/sampling; notifications other than `initialized`;
  streaming; transports other than stdio.

## Interfaces (exact)

### memory-workspace-root.ts

```ts
/** Nearest ancestor of `start` (inclusive) holding `.git` or `.mte`; else `start` resolved. */
export function resolveMemoryWorkspaceRoot(start: string): string
```

(Port of mte.mjs `findRoot`; do not import mte.mjs.)

### mcp/memory-mcp-server.ts

```ts
import type { Readable, Writable } from 'node:stream'

export type MemoryMcpServerOptions = {
  role: MemoryRole
  workspaceRoot: string
}

/** Serves the role-scoped memory tools over MCP stdio until stdin ends. Resolves when the input stream closes. */
export function runMemoryMcpServer(
  input: Readable,
  output: Writable,
  options: MemoryMcpServerOptions
): Promise<void>
```

Protocol requirements (JSON-RPC 2.0, newline-delimited JSON on both streams):

- `initialize` (request) → result:
  `{ protocolVersion: <echo client's if string, else '2024-11-05'>, capabilities: { tools: {} }, serverInfo: { name: 'orca-mte-memory', version: <orca package version> } }`
- `notifications/initialized` → no response (any `notifications/*` message: never respond).
- `tools/list` → `{ tools: [{ name, description, inputSchema }] }` — mapped
  from `handlers.tools` (already role-filtered); `inputSchema` is the tool's
  `input_schema` verbatim.
- `tools/call` params `{ name: string, arguments?: unknown }` → run
  `handlers.execute(name, arguments ?? {})`; result:
  `{ content: [{ type: 'text', text: JSON.stringify(toolResult) }], isError: toolResult.ok === false }`
  (the tool result object — including `{ok:false,error}` — is the payload; the
  LLM must see the error text).
- `ping` → `{}`.
- Unknown method (request) → error response `{ code: -32601, message: 'Method not found' }`.
- Malformed JSON line → write one error response `{ code: -32700, message: 'Parse error' }` with `id: null`, continue reading.
- Store errors during a call MUST become `isError: true` responses (never
  crash, never emit non-protocol bytes).
- Only protocol JSON on `output`. All diagnostics → `console.error` (stderr).
- Batch arrays (JSON-RPC `[{...}]`): reply `-32600 Invalid request` with `id: null`. Requests with missing/non `id` follow JSON-RPC: if `id` absent treat as notification (no response).

### CLI command

Register in the command registry following the existing `CommandSpec` pattern
(read `src/cli/dispatch.ts` and one existing command module first):

- path: `['mte', 'memory']`, summary: "Run the MTE memory MCP stdio server (role-scoped)".
- flags: `--role <orchestrator|coder|validator>` (required), `--workspace <path>` (optional; default `resolveMemoryWorkspaceRoot(process.cwd())`).
- Opens `openMemoryStore(memoryDbPath(workspaceRoot))`, runs
  `runMemoryMcpServer(process.stdin, process.stdout, { role, workspaceRoot })`,
  closes the store on stdin end. Exit 0 on clean end; exit 1 with stderr
  message on invalid role/workspace errors BEFORE any protocol bytes.
- The command must work with the app absent (pure Node path; no Electron imports — keep the module import graph Electron-free like the rest of `src/main/mte-flow`).

## Constraints

All T-0001 constraints: zero new deps (hand-rolled JSON-RPC framing; no MCP
SDK), reuse SyncDatabase + existing memory layer, English-only, no `as`
except `as const`, `(string & {}) | ':memory'` unions, 1-line why comments,
co-located Vitest tests. Stream tests use `PassThrough` streams — no child
processes.

## Acceptance criteria (testable)

1. `resolveMemoryWorkspaceRoot`: nearest `.git` or `.mte` ancestor wins;
   falls back to resolved start when none exists.
2. Handshake: send `initialize` → result has capabilities.tools, echoes
   client protocolVersion, serverInfo.name === 'orca-mte-memory'.
3. `tools/list` role gating: orchestrator → exactly 8 tools; coder → exactly
   `[ask_orq]`; validator → `[ask_orq]`; every entry has `inputSchema.type === 'object'`.
4. Round-trip over protocol with a temp workspace dir: `record_decision` →
   `get_decisions` returns it; coder `ask_orq` then a SECOND server instance
   (same workspace, role orchestrator) `answer_orq` → `search_memory` finds
   the Q&A in the qa bucket (proves cross-process persistence via the DB file).
5. `tools/call` with unknown name → `isError: true` and the payload contains
   `unknown tool`; role-forbidden call (coder calling `record_decision` by
   direct name) → `isError: true` with `not allowed for role`.
6. `ping` → `{}`; unknown request method → `-32601`; malformed line → single
   `-32700` response then server still answers subsequent valid requests;
   `notifications/initialized` produces no response.
7. Output purity: nothing but protocol lines on the output stream for the
   whole session (assert exact line sequence in at least one test).
8. `pnpm tc:node`, `oxlint src/main/mte-flow`, targeted vitest green.

## Validation commands

- `node config/scripts/run-vitest.mjs run --config config/vitest.config.ts src/main/mte-flow`
- `pnpm tc:node`, `./node_modules/.bin/oxlint src/main/mte-flow`
- If the CLI command registration touches `src/cli`, also run
  `node config/scripts/run-vitest.mjs run --config config/vitest.config.ts src/cli`
  and `pnpm tc:cli` if that script exists.

## Run log

| Attempt | Agent     | Outcome                                                                                                                                                                            |
| ------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | mte-coder | dispatched                                                                                                                                                                         |
| 1       | mte-coder | TASK_READY_FOR_VALIDATION — 61/61 mte-flow tests, 2181 src/cli tests, tc:node + tc:cli green, oxfmt repo-wide green, electron-ratchet green. 6 deviations (accepted, see Q&A log). |

## Q&A log

- 2026-10-29 scope decision (orchestrator): agent-config injection moved to
  T-0005 (it depends on which adapter the planner session uses — per-session
  agent choice is locked). T-0004 ships the MCP surface itself.
- 2026-10-29 deviation (accepted): store lifecycle lives inside
  `runMemoryMcpServer` (opens eagerly, closes on input end) instead of the CLI
  owning it — the spec's `MemoryMcpServerOptions` carries no store; CLI
  behavior observably identical.
- 2026-10-29 deviation (accepted): optional `version?: string` added to
  `MemoryMcpServerOptions` (default '0.0.0'); the CLI passes the asar-safe
  Electron-free CLI version source.
- 2026-10-29 deviation (accepted): 4 registry files wired beyond the spec's
  list (`cli-command-names.ts`, `remote-selection-scope.ts`,
  `flag-help-text.ts`, `command-scoped-flag-help.ts`) — required by repo
  parity/help gates when registering a command.
- 2026-10-29 deviation (accepted): invalid role/workspace handled inside the
  command handler (direct stderr + `process.exitCode = 1`) so failures stay
  off stdout even with `--json`.
- 2026-10-29 deviation (accepted): `tools/call` with missing/non-string name →
  `-32602 Invalid params` (spec silent; standard JSON-RPC).
- 2026-10-29 deviation (accepted): coder oxfmt-formatted the two orchestrator
  `.mte/` files that were red repo-wide (spec + session snapshot) — practice
  already recorded in T-0003.
