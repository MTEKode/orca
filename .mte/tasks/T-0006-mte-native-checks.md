# T-0006 — M3: native checks runner (orca mte check) + worker personas

Status: closed (VALIDATION_PASSED, attempt 1; 2026-10-29)
Attempt: 1
Created: 2026-10-29
Epic: MTE native replan. Depends on T-0004/T-0005. Replaces `mte.mjs validate`
(which dies with the standalone in T-0007) and gives the planner/validator
workers native repo-check execution + persona prompts.

## Context

Locked decisions: mte.mjs dies entirely including `validate`; validation =
native checks runner + validator workers; workers never touch memory (they ask
via `orca orchestration ask`); the planner drives gates (`gate-create` /
`gate-resolve`) around validation.

Port source (reference only — do NOT import): `~/.mte/bin/mte.mjs`
`detectChecks`/`validate`. Semantics to preserve: stack detection
(node/python/go/rust + Makefile fallbacks), per-group run with timeout
(default 600s) and failure tail (default 50 lines), exit code = number of
failing groups.

## In scope

1. `src/main/mte-flow/checks/detect-checks.ts` — stack detection.
2. `src/main/mte-flow/checks/run-checks.ts` — runner.
3. `src/main/mte-flow/worker-personas.ts` — `MTE_CODER_PERSONA`,
   `MTE_VALIDATOR_PERSONA`.
4. `orca mte check` CLI command (extend `src/cli/specs/mte.ts` +
   `src/cli/handlers/mte.ts`, same registry patterns as T-0004/T-0005).
5. Co-located tests.

## Out of scope

- Gate automation (planner drives gates via existing CLI — prompt-level).
- Memory questions bridge (already native: ask/reply/inbox; T-0005 prompt
  teaches persistence).
- Any change to the retired `coordinator-*` surface.

## Interfaces (exact)

### checks/detect-checks.ts

```ts
export type DetectedChecks = {
  lint: string // shell command or 'none'
  typecheck: string
  test: string
}

/** Faithful port of mte.mjs detectChecks (node/python/go/rust + Makefile fallbacks). */
export function detectChecks(workspaceRoot: string): DetectedChecks
```

Detection order (preserve exactly): package.json scripts (`lint`,
`typecheck`, `test`) first; eslint config + local bin fallback
(`npx --no-install eslint .`); tsc fallback (`npx --no-install tsc --noEmit`);
python (pyproject/setup.py/setup.cfg): uv-managed (`uv run ruff check .`,
`uv run pytest -q`, `uv run mypy .` when `[tool.mypy]` present) vs bare
(`ruff check .`, `pytest -q`, `mypy .`); go (`go vet ./...`, golangci-lint
when configured, `go test ./...`); rust (`cargo clippy --quiet -- -D
warnings` else `cargo fmt --check`; `cargo test --quiet`); Makefile `lint:` /
`test:` targets as final fallbacks. Helper predicates (`hasBin`,
`fileMatches`, `commandExists`) ported as small local functions — Electron-free.

### checks/run-checks.ts

```ts
export type CheckGroupResult = {
  group: 'lint' | 'typecheck' | 'test'
  command: string | 'none'
  status: 'passed' | 'failed' | 'skipped'
  exitCode: number | null
  tail: string // last N lines of combined output when failed; '' otherwise
  timedOut: boolean
  durationMs: number
}

export type RunChecksOptions = {
  workspaceRoot: string
  timeoutSeconds?: number // default 600
  tailLines?: number // default 50
  only?: ReadonlyArray<'lint' | 'typecheck' | 'test'>
  onProgress?: (line: string) => void // optional live stderr echo
}

/** Runs detected groups sequentially (lint, typecheck, test); 'none' commands are skipped. */
export function runChecks(options: RunChecksOptions): CheckGroupResult[]

/** Number of failed groups — the process exit code contract. */
export function failedGroupCount(results: CheckGroupResult[]): number
```

Implementation: `spawnSync(cmd, { shell: true, cwd: workspaceRoot, timeout:
timeoutSeconds * 1000, maxBuffer: generous })`; capture combined output;
tail = last `tailLines` lines on failure. Never throw on non-zero exits —
results carry everything. Kill-tree behavior: rely on spawnSync timeout
(document limitation if any).

### worker-personas.ts

```ts
/** Persona preamble the planner embeds in coder task specs (native verbs). */
export const MTE_CODER_PERSONA: string

/** Persona preamble for validator workers (read-only, verdict contract). */
export const MTE_VALIDATOR_PERSONA: string
```

`MTE_CODER_PERSONA` must contain (substring-asserted): execute the embedded
task spec faithfully; work only inside the dispatch worktree; blocking
questions via `orca orchestration ask` (never guess requirement-level
answers); no git push, no history rewriting; finish by reporting outcome in
the final message (native lifecycle settles the dispatch).

`MTE_VALIDATOR_PERSONA` must contain: read-only (never edit files); run
`orca mte check` (plus any repo-specific commands named in the task spec);
report per-group results; end with exactly one verdict line
`VALIDATION_PASSED` or `VALIDATION_FAILED: <numbered failures>`; attribute
pre-existing failures separately from diff-caused ones.

### CLI: `orca mte check`

- path `['mte','check']`; flags: `--workspace <path>` (default
  `resolveMemoryWorkspaceRoot(process.cwd())`), `--timeout <seconds>`,
  `--tail <lines>`, `--only <group>` (repeatable), `--json`, `--detect`
  (print detected commands and exit 0 without running).
- Text output: one line per group `GROUP=command ... passed|failed|skipped
  (exit N, Xs)` plus tail block for failures (prefixed, stderr). JSON: single
  object `{ workspaceRoot, detected, results, failedGroups }`.
- Exit code = `failedGroupCount(results)` (0 green; matches mte.mjs contract).
- Same registry wiring as `mte start` (manifest, flag help, local-only scope).

## Constraints

Prior-task constraints unchanged (zero deps, English, no `as` except
`as const`, oxfmt-clean including `.mte/`, Electron-free module graph,
co-located Vitest). Tests must not run real repo toolchains: detection tests
use fixture dirs (tmp); runner tests use trivial shell commands
(`echo`, `exit 1`, `sleep`) with tiny timeouts.

## Acceptance criteria

1. detectChecks: node fixture (scripts + eslint/tsc fallbacks), python uv and
   bare fixtures, go, cargo, Makefile fallback, empty dir → all 'none'.
2. runChecks: passing group → status passed exit 0; failing group → failed +
   tail equals last N lines; `none` → skipped; timeout → timedOut true,
   failed; `only` filters groups; failedGroupCount exact.
3. Personas contain all required substrings; validator verdict contract
   exact (`VALIDATION_PASSED` / `VALIDATION_FAILED:`).
4. CLI: `--detect` prints LINT=/TYPECHECK=/TEST= lines, exit 0; run mode exit
   code = failed group count; `--json` shape asserted; `--only` respected;
   help wired (scoped flags).
5. Gates: targeted vitest `src/main/mte-flow src/cli`; `pnpm tc:node`;
   `pnpm tc:cli`; oxlint touched files; repo-wide `oxfmt --check .`; electron
   ratchet.

## Validation commands

- `node config/scripts/run-vitest.mjs run --config config/vitest.config.ts src/main/mte-flow src/cli`
- `pnpm tc:node && pnpm tc:cli`
- `./node_modules/.bin/oxlint <touched>` ; `./node_modules/.bin/oxfmt --check .`

## Run log

| Attempt | Agent                     | Outcome                                                                                                                                                                                                                           |
| ------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | mte-coder                 | dispatched                                                                                                                                                                                                                        |
| 1       | mte-validator (eco route) | VALIDATION_PASSED — 2310 tests, tc node+cli, oxlint, oxfmt repo-wide, electron+max-lines ratchets, port fidelity vs mte.mjs exact, real CLI smoke (built out/cli: --detect, run exit=failed-groups, --json, stderr tail). Closed. |
| 1       | mte-coder (eco route)     | TASK_READY_FOR_VALIDATION — 2310 tests, tc node+cli, oxlint, oxfmt repo-wide, electron ratchet all green. 5 deviations accepted (see Deviations log).                                                                             |

## Q&A log

- 2026-10-29 scope decision (orchestrator): gate automation and memory
  questions bridge stay prompt-level (native CLI verbs already exist);
  T-0006 ships the runner + personas only.

## Deviations log (attempt 1, accepted)

- 2026-10-29 (accepted): runner keeps the reference implementation's temp-log
  redirect (`> log 2>&1` + `stdio:'ignore'`) instead of plain stdout capture —
  avoids the spawnSync orphaned-child pipe stall on timeout (the reason
  mte.mjs did it); kill-tree limitation documented in code.
- 2026-10-29 (accepted): `onProgress` emits one start + one completion line
  per group (streaming incompatible with the log redirect); JSDoc-documented.
- 2026-10-29 (accepted): check command extracted to
  `src/cli/handlers/mte-check.ts` — `handlers/mte.ts` would exceed the repo's
  300-line max-lines rule; registration unchanged.
- 2026-10-29 (accepted): `refuseUsage` duplicated locally in `mte-check.ts`
  (import-cycle avoidance).
- 2026-10-29 (accepted): `CheckGroupResult.command` typed `string` (spec's
  `string | 'none'` collapses); literal `'none'` preserved for skipped groups.

| Attempt | Agent                 | Outcome                                                                                                                                |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | mte-coder (eco route) | TASK_READY_FOR_VALIDATION — 2310 tests, tc node+cli, oxlint, oxfmt repo-wide, electron ratchet all green. 5 deviations accepted above. |
