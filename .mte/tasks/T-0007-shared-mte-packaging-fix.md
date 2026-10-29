# T-0007 — Packaging fix: move CLI-consumed mte modules to src/shared/mte

Status: dispatched
Attempt: 1
Created: 2026-10-29
Blocks: app packaging (`pnpm build:unpack` fails `verify:built-skills-cli`).
Epic note: the standalone-deletion task is renumbered to T-0008.

## Root cause (verified empirically — do not re-derive)

1. `config/tsconfig.cli.json` compiles `src/cli/**` + `src/shared/**`;
   `src/main` files enter the program through CLI imports and emit per-file
   into `out/main/**` (rootDir=src, outDir=out).
2. `build:desktop:assets` order: `build:cli` → `build:electron-vite` →
   `verify:built-skills-cli`. electron-vite EMPTIES `out/main` and re-emits
   only the main-entry-reachable graph (~56 files). `out/cli` and
   `out/shared` survive.
3. Our T-0004..T-0006 modules (`src/main/mte-flow/{memory-*,checks,mcp,
   planner-prompt,worker-personas}`) are imported ONLY by the CLI → not
   main-reachable → wiped → `out/cli/handlers/mte.js` dangles →
   `verify-skills-cli-runtime.cjs` fails: `missing runtime import
   "../../main/mte-flow/planner-prompt"`.
4. Upstream precedent: the few `src/cli → src/main` imports (e.g.
   `macos-tree-clone`) resolve because those modules are main-reachable and
   vite emits same-named chunks. `src/shared` NEVER imports `src/main`
   upstream (verified: zero hits) — layering rule.

## Fix

Move the CLI-consumed mte tree to `src/shared/mte/` (survives packaging) and
cut its only `src/main` dependency (SyncDatabase) with a minimal local
sqlite connection wrapper. `src/main/mte-flow/installer.ts` +
`apply-setting.ts` stay (main-only, die in T-0008 anyway).

### File moves (git mv, keep history)

| From                                         | To                                        |
| -------------------------------------------- | ----------------------------------------- |
| `src/main/mte-flow/memory-database.ts`       | `src/shared/mte/memory-database.ts`       |
| `src/main/mte-flow/memory-store.ts`          | `src/shared/mte/memory-store.ts`          |
| `src/main/mte-flow/memory-tools.ts`          | `src/shared/mte/memory-tools.ts`          |
| `src/main/mte-flow/memory-workspace-root.ts` | `src/shared/mte/memory-workspace-root.ts` |
| `src/main/mte-flow/planner-prompt.ts`        | `src/shared/mte/planner-prompt.ts`        |
| `src/main/mte-flow/worker-personas.ts`       | `src/shared/mte/worker-personas.ts`       |
| `src/main/mte-flow/checks/detect-checks.ts`  | `src/shared/mte/checks/detect-checks.ts`  |
| `src/main/mte-flow/checks/run-checks.ts`     | `src/shared/mte/checks/run-checks.ts`     |
| `src/main/mte-flow/mcp/memory-mcp-server.ts` | `src/shared/mte/mcp/memory-mcp-server.ts` |
| all co-located `.test.ts` of the above       | move alongside                            |

### Import rewrites

- `src/cli/handlers/mte.ts`, `mte-check.ts`, `mte-start-launch.ts`,
  `src/cli/specs/mte.ts` (+ their tests): `../../main/mte-flow/...` →
  `../../shared/mte/...`.
- Moved modules' internal relative imports adjust to the new depth
  (`memory-tools.ts`: `../../shared/error-message` → `../error-message`;
  `memory-database.ts`: drop `../sqlite/sync-database`, use the new wrapper).
- NOTHING else may import `src/main/mte-flow/*` after the move except
  main-side files (none currently).

### New: `src/shared/mte/sqlite-connection.ts`

Minimal Electron-free wrapper over the `node:sqlite` builtin (loaded via
`process.getBuiltinModule('node:sqlite')` like `src/main/sqlite/sync-database.ts`
does — copy that lazy-load + availability-check pattern, NOT the class):

```ts
export type SqliteConnection = {
  exec(sql: string): void
  prepare(sql: string): {
    all(...p: unknown[]): Record<string, unknown>[]
    get(...p: unknown[]): Record<string, unknown> | undefined
    run(...p: unknown[]): { changes: number; lastInsertRowid: number }
  }
  pragma(sql: string): void
  close(): void
}
export function openSqliteConnection(path: (string & {}) | ':memory:'): SqliteConnection
```

- `run()` must normalize `lastInsertRowid`/`changes` to `number` (may be
  bigint from the builtin — convert with `Number(...)`, safe for our ids).
- Rows: plain objects; no int64 reader needed (ids are small).
- No statement cache, no backup, no transaction helpers (memory-store's
  BEGIN/COMMIT via exec stays as-is).
- `memory-database.ts` switches from `Database` (SyncDatabase) to
  `SqliteConnection`; pragmas via `pragma()`; DDL unchanged; keep
  `isSqliteAvailable`-style guard? Not required — `openSqliteConnection`
  throws a clear Error when the builtin is unavailable (mirror
  sync-database's message style).
- Unit tests for the wrapper (open :memory:, exec/prepare/run/get/all,
  lastInsertRowid numbers, pragma no-throw, close idempotent-safe).

### Behavior parity (binding)

All existing behavior/tests of the moved modules must pass unchanged
(import paths aside): schema DDL identical, role gating identical, FTS
identical, MCP protocol identical, CLI flags/output identical, exit codes
identical. Do not "improve" anything else.

## Acceptance criteria

1. `grep -rn "main/mte-flow" src/cli src/shared` → zero hits (except none);
   `src/shared/mte/**` imports nothing from `src/main/**` (assert with grep;
   electron ratchet stays green).
2. `src/main/mte-flow/` contains only `installer.ts`, `apply-setting.ts`,
   `installer.test.ts` (+ any main-only bits).
3. Targeted vitest green: `src/shared/mte`, `src/cli`, `src/main/mte-flow`.
4. `pnpm tc:node && pnpm tc:cli` exit 0 (and `tc:web` if cheap — shared may
   be pulled into web graph; it must not break).
5. oxlint touched files; repo-wide `oxfmt --check .` green.
6. **`pnpm build:unpack` completes green** (this is the regression that
   defines the task; it runs build:cli → electron-vite → verify-skills-cli).
   Long build (~10+ min) — run it, capture the tail.
7. Packaged smoke: `node out/cli/index.js mte check --detect --workspace
   /tmp/mte-e2e` AND `node out/cli/index.js mte memory --role coder
   --workspace /tmp/mte-e2e` handshake (initialize → tools/list →
   `[ask_orq]`) against the POST-build `out/` tree (the one electron-builder
   packaged). Also `dist/mac-arm64/Orca.app/Contents/Resources/bin/orca mte
   --help` if the packaged bin exists.
8. Electron ratchet: `node config/scripts/check-runtime-electron-ratchet.mjs`
   green.

## Constraints

Zero new deps; English; no `as` except `as const`; `(string & {}) | ':memory'`
unions; co-located tests; `.mte/` stays oxfmt-clean; do not reformat
unrelated files; git mv for moves (history).

## Validation commands

- targeted vitest (criterion 3), tc, oxlint, oxfmt
- `pnpm build:unpack` (criterion 6) — the full packaging proof
- packaged smokes (criterion 7)

## Run log

| Attempt | Agent     | Outcome                                                                                                                                                                                                                            |
| ------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | mte-coder | BLOCKED before dispatch: all subagent model routes exhausted (bailian plan + zai reset 2026-10-30 17:47; opencode free tier limit reached). Spec complete and ready; dispatch pending quota or user-authorized alternate executor. |

## Q&A log

- 2026-10-29 root-cause investigation (orchestrator): evidence in "Root
  cause" section (out/main=56 vite files, out/main/sqlite absent,
  macos-tree-clone present as vite chunk, zero shared→main imports upstream,
  tsconfig.cli comment "src/main files come in through imports").
- 2026-10-29 architecture decision (orchestrator): move to `src/shared/mte/`
  instead of (a) making modules main-reachable via dead imports, (b)
  reordering build scripts (would flip tsc-vs-vite winners on overlapping
  files), (c) moving upstream `src/main/sqlite` (merge-conflict magnet).
  Local minimal sqlite wrapper accepted over SyncDatabase reuse — packaging
  layering outranks the T-0001 reuse preference; wrapper stays ~60 lines.
