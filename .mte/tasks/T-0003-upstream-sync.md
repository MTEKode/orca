# T-0003 — Sync fork-main with upstream origin/main (epic step 0)

Status: in_progress
Attempt: 1
Created: 2026-10-29
Epic: MTE native replan (see memory note `mte-native-orplan-locked` / this lock in
`T-0004+` specs). This task unblocks all native wiring work: fork-main is far
behind origin/main and the wiring targets runtime files that only exist
upstream (e.g. `structured-agent-session-question-params.ts`).

## Requirements (from locked replan, decision 2)

- Merge `origin/main` INTO `fork-main` (merge, never rebase — fork-main is
  published at fork:main and history must not be rewritten).
- Working tree must be clean before merging.
- After a successful merge: dependency install (upstream moves the lockfile),
  then the repo gate, then push to fork:main.

## Steps

1. `git status --porcelain` — must be empty (commit or stash local noise first;
   report what was found).
2. `git fetch origin main`.
3. `git merge origin/main --no-edit` on `fork-main`.
4. Conflict policy (dispatch to coder if conflicts are non-trivial):
   - Fork-only paths (`.github/workflows/mtekode-*`, `adhoc-mac-build.yml`,
     `hourly/daily-mac-build`, `dev-channel-win-*`, `resources/mte-flow/**`,
     `src/main/mte-flow/**`, `.mte/**`) — ours win; upstream has no stakes.
   - Shared paths (`.gitignore`, shared workflows modified by both sides) —
     keep BOTH sides' hunks where semantically additive; upstream wins on
     anything we do not clearly own.
   - If our memory layer's imports break because upstream moved
     `src/main/sqlite/*` or `src/shared/error-message`, fix imports in a
     follow-up commit (coder task, not this one).
5. `pnpm install` (lockfile moved upstream).
6. Gate: `pnpm check:changed --maxWorkers=2` (background; long). Minimum bar if
   the full gate is impractical: `pnpm tc:node`, `oxlint src/main/mte-flow`,
   targeted vitest `src/main/mte-flow`. Full-suite failures that exist on
   origin/main HEAD itself are not-attributable; anything caused by the merge
   resolution is attributable and must be fixed before push.
7. `git push fork fork-main:main`.
8. Update this run log; close on green gate + push.

## Acceptance criteria

1. `fork-main` contains origin/main HEAD as an ancestor; no history rewrite
   (push is a fast-forward on fork:main).
2. Working tree clean after the merge commit; no conflict markers anywhere.
3. `pnpm install` clean; `pnpm tc:node` exit 0; targeted mte-flow tests green;
   check:changed either green or its failures proven pre-existing on
   origin/main HEAD.
4. Pushed to fork:main.

## Conflict resolution addendum (attempt 1, live merge)

Merge of origin/main @86def974bd into fork-main is IN PROGRESS (MERGE_HEAD set).
Conflict inventory + policy:

| Path                                                                                                                                                                    | Kind    | Policy                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/{computer-e2e,dependency-security,mobile,node-server-tests,pr-test-loc,pr,unit-selection-evidence,windows-typecheck-parity,wsl-orcad-e2e}.yml`        | UU ×9   | Take upstream (`--theirs`). Fork-only workflows (mtekode-\*, adhoc/daily/hourly mac, dev-channel win) stay untouched.                                                               |
| `src/shared/repo-types.ts`                                                                                                                                              | UU      | UNION: fork adds `RepoLanguageServerSettings` (LSP line), upstream adds `OrcadRetainedMarker`. Keep both imports and both sides' type additions.                                    |
| `src/renderer/src/lib/monaco-languages/textmate-language-registration.test.ts`                                                                                          | UD      | Fork's Ruby-TextMate feature modified it; upstream deleted it and replaced the textmate system. Preserve fork's Ruby grammar behavior adapted to upstream's new architecture; if the old test is obsolete, delete it but ensure equivalent Ruby-grammar coverage exists. |
| `src/cli/bundled-skill-guides.ts`                                                                                                                                       | UU      | Inspect; union if additive, else upstream.                                                                                                                                          |
| `src/renderer/src/i18n/en-runtime-required.json`                                                                                                                        | UU      | Union of keys from both sides.                                                                                                                                                      |

Principle: BOTH feature lines survive — upstream's monaco/orcad refactor AND
fork's LSP/Ruby navigation. Auto-merged-but-typebroken code counts as part of
the conflict: `pnpm tc:node` must be green after resolution. Escape hatch if
irreconcilable: `git merge --abort` + ASK_ORCHESTRATOR (never force).

## Run log

| Attempt | Agent                       | Outcome     |
| ------- | --------------------------- | ----------- |
| 1       | mte (orchestrator, git ops) | in progress |

## Q&A log

- 2026-10-29: user locked "merge, no rebase" (published fork history).
