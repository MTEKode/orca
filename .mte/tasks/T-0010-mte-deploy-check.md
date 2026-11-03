# T-0010 — Optional end-of-flow deploy check: monitor, test in the embedded browser, report to Linear

Goal item 2 of batch 2 (lock: `.mte/memory/requirements-lock-batch2.md`). Depends on T-0009 (project settings plumbing).

## Context

- Planner prompt: `src/shared/mte/planner-prompt.ts` (`plannerKickoffPrompt(goal)`). The planner already ends with validation; we add a final optional step.
- CLI MTE commands: specs `src/cli/specs/mte.ts`, handlers `src/cli/handlers/mte.ts` (`MTE_HANDLERS`), lazy group `src/cli/handler-group-manifest.ts:300`, flag help `src/cli/command-scoped-flag-help.ts:98`. CLI code must import only from `src/shared` (packaging rule), main-only helpers must be reached through RPC.
- Embedded browser CLI for agents: `orca goto --url`, `orca snapshot`, `orca click --element`, `orca fill --element --value`, `orca type --input`, `orca screenshot` (`src/cli/specs/browser-basic.ts`).
- Linear: linked issue on a workspace = `linkedLinearIssue` (identifier e.g. ENG-123) + `linkedLinearIssueWorkspaceId` (`src/shared/worktree/create-types.ts:108`). RPCs `linear.issueAddComment` `{...LinearWriteTarget, body}` and `linear.issueSetState` `{...LinearWriteTarget, to}` (`src/main/runtime/rpc/methods/linear-agent-access.ts:101,119`), `LinearWriteTarget = {input?, current?: boolean, workspaceId?, context}` (`src/shared/rpc-contract/linear-agent-access-params.ts:61`). CLI equivalents: `orca linear status set`, `orca linear comment add` (`src/cli/specs/linear.ts`).
- Secrets: `getSecretStore()` from `src/shared/secret-store.ts`; pattern to copy `src/main/speech/openai-api-key-store.ts` (save/read/clear). Never write the password to settings files.
- Repo settings plumbing: see T-0009 context (repo-types, repo-state, repo-update-params, repo-update-handler, RepositoryPane).

## Behaviour

1. **Project config** (RepositoryPane section "Deploy check"): fields `deployCheck?: { url: string; username: string; linearDoneState?: string }` on `Repo` (`linearDoneState` default `'Done'`), plus a password input that is stored through a new IPC pair `repos:deployCheckPassword:set {repoId, password}` / `:clear {repoId}` / `:has {repoId} → boolean` (preload bridge in `src/preload/api/repos-bridge.ts`, main handler new file `src/main/ipc/repos/deploy-check-password-handler.ts`, secret key `deploy-check:<repoId>`). UI shows "Password saved" state, never the value.
2. **Planner prompt**: append a final section "Deploy check (optional)": after the last task passes validation, ask the user (question tool) whether to monitor and test the deploy. If yes: run `orca mte deploy-check config --json`; if it returns `{configured:false}` tell the user to fill Deploy check in project settings and stop. Else: poll `orca goto --url <url>` + `orca snapshot` until the page responds (max 10 minutes, every 30 s), log in with the username/password from the config output using `orca fill`/`orca click` on the login form found in the snapshot, exercise the feature(s) delivered in this flow, take `orca screenshot` as evidence, then run `orca mte deploy-check validated --summary "<how it was validated>"` (or `--failed --summary ...`). Report the result to the user.
3. **CLI** `orca mte deploy-check config [--json]`: resolves the workspace repo (reuse how `orca linear issue --current` resolves the current worktree), prints `{configured, url, username, password, linearDoneState}` (password decrypted at call time via a new RPC `mte.deployCheckConfig {workspaceRoot}` with permission `'workspace'`; main reads repo settings + secret store). Text mode prints the same without the password.
4. **CLI** `orca mte deploy-check validated --summary <text> [--failed] [--json]`: RPC `mte.deployCheckReport {workspaceRoot, summary, ok}`. Main: if the worktree has `linkedLinearIssue`, add comment `"Deploy validated by Orca MTE flow:\n\n<summary>"` (or "Deploy validation FAILED…") via the existing comment path, and when `ok` move the issue to `linearDoneState` via the existing set-state path (resolve by state name, case-insensitive, within the issue's team). Returns `{linear: 'commented+moved' | 'commented' | 'skipped-no-issue' | 'failed:<reason>'}`. Without a linked issue → `skipped-no-issue`, exit 0.

## Deliverables

| File                                                                                                               | Change                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `src/shared/repo-types.ts` + repo-state/repo-update-params/repo-update-handler                                     | `deployCheck` object                                                                                          |
| `src/shared/mte/deploy-check.ts` (new)                                                                             | types `MteDeployCheckConfig`, `MteDeployCheckReport`, pure `deployCheckLinearCommentBody(summary, ok)` + test |
| `src/main/mte/deploy-check-password-store.ts` (new)                                                                | save/read/clear via secret store                                                                              |
| `src/main/ipc/repos/deploy-check-password-handler.ts` + preload bridge + `window.api` types                        | IPC                                                                                                           |
| `src/main/runtime/rpc/methods/mte.ts` (from T-0009)                                                                | `mte.deployCheckConfig`, `mte.deployCheckReport` (split into `mte-deploy-check.ts` if >300 lines)             |
| `src/cli/specs/mte.ts`, `src/cli/handlers/mte-deploy-check.ts` (new), manifest, flag help                          | CLI commands                                                                                                  |
| `src/shared/mte/planner-prompt.ts`                                                                                 | final deploy-check section                                                                                    |
| `src/renderer/src/components/settings/repository/RepositoryDeployCheckSection.tsx` (new) + RepositoryPane + search | UI                                                                                                            |
| i18n                                                                                                               | keys                                                                                                          |
| tests                                                                                                              | comment body; CLI invocation parsing; main report handler with mocked linear (commented+moved / skipped)      |

## Acceptance criteria

- Settings persist url/username/state; password lives only in the secret store; `has` reflects it.
- `orca mte deploy-check config --json` in a configured workspace returns the password; unconfigured → `{configured:false}`.
- `orca mte deploy-check validated --summary x` with a linked issue adds the comment and moves state; without → `skipped-no-issue`.
- Planner prompt snapshot test updated. Lint/format/typecheck/tests green (same commands as T-0009).

## Constraints

Same as T-0009. Never print the password in text mode or in logs. Do not commit.

## Q&A log

(empty)

## Run log

| attempt | role      | result                    | notes                                                                                                                                                |
| ------- | --------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | coder     | TASK_READY_FOR_VALIDATION | 148 tests; src/main/runtime/rpc dir red at HEAD (stash-verified)                                                                                     |
| 1       | validator | VALIDATION_FAILED         | RepositoryPane.test mock lacks deployCheckPassword; oxfmt fails on 7 files; plaintext fallback rejected                                              |
| 2       | coder     | TASK_READY_FOR_VALIDATION | defensive bridge read; oxfmt per file via node_modules/.bin; plaintext fallback removed (typed error + UI passwordError)                             |
| 2       | validator | VALIDATION_FAILED         | handler-group-manifest.ts 306 lines (>300, 304 at HEAD); consistent-type-imports in deploy-check-password-store.test.ts:8. 2nd strike → mte-coder-hi |
| 3       | coder-hi  | TASK_READY_FOR_VALIDATION | mte group moved to src/cli/mte-handler-group.ts (linear/jira pattern); import type * as NodeOs                                                       |
| 3       | validator | VALIDATION_PASSED         | 546/548 (2 pre-existing); lint/format/tc/catalogs clean                                                                                              |
