# T-0011 — Project option: run quick commands in the floating terminal by default

Goal item 3 of batch 2 (lock: `.mte/memory/requirements-lock-batch2.md`).

## Context

- Floating terminal = pseudo-workspace `FLOATING_TERMINAL_WORKTREE_ID` (`src/shared/constants.ts:81`). Reveal: `revealFloatingWorkspacePanel(useAppStore.getState())` (`src/renderer/src/lib/floating-workspace-panel-reveal.ts:12`). Tabs are created with `createTab(FLOATING_TERMINAL_WORKTREE_ID, groupId, shellOverride, options)`; see `use-floating-terminal-create-actions.ts:66`.
- Quick commands launch through `runQuickCommandInNewTab({command, worktreeId, groupId, historyId})` in `src/renderer/src/lib/run-quick-command-in-new-tab.ts:45` (shell path :91-108 uses `pendingStartup: { command }`). Callers: `TabBarQuickCommandsButton.tsx:145`, `use-terminal-pane-context-menu.ts:243`.
- The floating workspace has its own cwd (`settings.floatingTerminalCwd`), so the command must run inside the repo: prefix with `cd <shell-quoted worktree path> && <command>` unless `pendingStartup` already supports a cwd (check `store/terminals/terminal-tab-creation.ts:43` and the PTY startup path first; if a cwd field exists, use it).
- Project settings plumbing: see T-0009 (`Repo`, repo-state, repo-update-params, repo-update-handler, RepositoryPane). Setup/issue commands at worktree creation are out of scope.

## Behaviour

- New project setting `quickCommandsInFloatingTerminal?: boolean`; undefined → `true` (lock: enabled by default).
- In `runQuickCommandInNewTab`, after the empty-command check: if the setting is on for the repo owning `worktreeId`, the agent-kind branch is unchanged (agents stay in the workspace), and the shell branch creates the tab under `FLOATING_TERMINAL_WORKTREE_ID` (groupId = active floating group or undefined), with the command run in the worktree path, then calls `revealFloatingWorkspacePanel`. `quickCommandLabel` and history behaviour unchanged.
- If `settings.floatingTerminalEnabled` is false, `revealFloatingWorkspacePanel` already turns it on; keep that.
- RepositoryPane switch "Run quick commands in the floating terminal" + search entry; i18n keys.

## Deliverables

| File                                                                        | Change                                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| repo-types / repo-state / repo-update-params / repo-update-handler          | key                                                                                                              |
| `src/renderer/src/lib/run-quick-command-in-new-tab.ts`                      | branch; extract `quickCommandFloatingTarget(...)` pure helper if needed for size                                 |
| `src/renderer/src/lib/run-quick-command-in-new-tab.test.ts` (new or extend) | setting on → tab created under floating id with cwd-prefixed command and panel revealed; setting off → unchanged |
| RepositoryPane + repository-search + i18n                                   | switch                                                                                                           |

## Acceptance criteria

- With default settings, clicking a shell quick command opens it in the floating panel running in the repo directory; agent quick commands unchanged.
- Switch off → previous behaviour.
- Lint/format/typecheck/tests green (commands as T-0009). Do not commit.

## Q&A log

(empty)

## Run log

| attempt | role | result | notes |
| ------- | ---- | ------ | ----- |
| 1 | coder | TASK_READY_FOR_VALIDATION | cd-prefix via shellEscapePath (pendingStartup has no cwd); oxlint/oxfmt multi-file flaky — validator to re-run per file |
| 1 | validator | VALIDATION_FAILED→accepted as PASSED by orchestrator | only failures = pre-existing language-servers test (not attributable); oxfmt on .ts verified by orchestrator (all 0) |
