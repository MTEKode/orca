# T-0101-V — Validate T-0101 (MTE worker pin contracts) — VALIDATOR, read-only

You are the MTE Validator. Never edit files, never commit. Validate commit ff1aa98e4f on the current branch against spec `.mte/tasks/T-0101-mte-worker-pin-contracts.md` (read it first).

Run, in this worktree:

1. `git show --stat ff1aa98e4f` and confirm the touched files match the spec's deliverables (no renderer behaviour changes beyond type plumbing, no antigravity main code, no hand edits to `src/cli/bundled-skill-guides.ts`).
2. `pnpm exec oxlint <touched files>` and `pnpm exec oxfmt --check <touched files>` (or the repo's lint/format scripts from package.json applied to those files).
3. Targeted vitest with `pnpm exec vitest run --config config/vitest.config.ts <paths>` for: `src/shared/mte`, `src/cli/handlers/mte*`, `src/cli/specs`, `src/shared/agent-session/lifecycle`, `src/main/runtime/agent-session/records`, `src/main/agent-launch`, `src/main/runtime/rpc/methods/agent-launch*`, `src/shared/rpc-contract`.
4. Typecheck ONCE for the whole repo with the repo's node/main+shared typecheck script (see package.json, e.g. `pnpm tc:node` or `pnpm typecheck`; 600s timeout). Attribute any error to the diff or to baseline (compare with `git stash`-free method: `git worktree`-less approach is `git diff ff1aa98e4f~1 --name-only` vs the error file list; errors in untouched files are baseline).
5. The coder reported 62 failures in `src/main/runtime/rpc/**orchestration-*` tests with `runtime_unavailable`. Run that test subset at HEAD and at `ff1aa98e4f~1` (use `git stash push -u -m validator-T0101` only if the tree is dirty, then `git stash apply`, never pop blindly; prefer `git worktree add /tmp/t0101-base ff1aa98e4f~1` and run there) and state whether the failures are pre-existing.
6. Spec acceptance spot-checks: `plannerKickoffPrompt('x', {agent:'opencode', model:'qwen3.8', effort:'medium'})` contains opencode/qwen3.8/medium and lacks the unpinned question sentence; `mteAdapterForAgent('antigravity') === 'antigravity'`; a record with an invalid `mteWorker` agent is rejected by the record guard. Use the existing tests as evidence or a one-off `node`/vitest script if a check lacks a test.

Report per group: command, exit code, failure tail. Attribute pre-existing failures separately. End with exactly one line: `VALIDATION_PASSED` or `VALIDATION_FAILED: <numbered failures>`.
