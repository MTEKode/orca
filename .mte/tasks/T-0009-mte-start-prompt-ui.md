# T-0009 — Ask to use the native MTE flow when creating a chat, notify on start

Goal item 1 of batch 2 (lock: `.mte/memory/requirements-lock-batch2.md`).

## Context

MTE today starts only from the CLI (`orca mte start`, `src/cli/handlers/mte.ts:166` `runMteStart`):
it plans+applies the workspace MCP config (`planWorkspaceMcpConfig`/`applyWorkspaceMcpConfig`
in `src/shared/mte/mcp/workspace-mcp-config.ts`), then launches a chat with
`plannerKickoffPrompt(goal)` (`src/shared/mte/planner-prompt.ts`) through the `agent.launch` RPC.
There is no renderer UI. The "+" / New Chat menu runs `runLaunch` in
`src/renderer/src/components/tab-bar/QuickLaunchButton.tsx:80-110` → `launchAgentInNewTab`.
Promise-based confirm dialog: `useConfirmationDialog()` in
`src/renderer/src/components/confirmation-dialog-context.ts:50` (supports `dontAskAgain`).
Toasts: `import { toast } from 'sonner'`.
Project settings live on `Repo` (`src/shared/repo-types.ts:41`); adding a key touches
`repo-types.ts`, `src/renderer/src/store/repos/repo-state.ts:37` (RepoUpdate pick),
`src/shared/rpc-contract/repo-update-params.ts:40` (zod), `src/main/ipc/repos/repo-update-handler.ts`
(allowlist ~:49, normalize ~:231). Write via `useAppStore().updateRepo(projectId, updates)`.
Settings UI: `src/renderer/src/components/settings/repository/RepositoryPane.tsx` (+ `repository-search.ts`).
i18n: `src/renderer/src/i18n/locales/en.json` first, then es/fr/ja/ko/zh, then
`pnpm verify:localization-catalog` and `node config/scripts/generate-runtime-required-english-catalog.mjs --fix`.

## In scope

1. New project setting `mteFlowPrompt?: 'ask' | 'never'` (default `'ask'` when undefined).
2. When the user creates a **chat** (requestedSurface `'chat'`) from the New Chat menu in a repo
   worktree (not folder workspaces, not the floating terminal workspace) and the agent maps to an MTE
   adapter (`claude`→claude, `codex`→codex, `opencode`|`opencode-v2`→opencode; any other agent → no
   dialog), show a confirm dialog: title "Use MTE orchestration for this chat?", description
   explaining the planner will drive coder/validator agents, confirm "Use MTE", cancel "Plain chat",
   `dontAskAgain` → sets `mteFlowPrompt: 'never'` on the repo.
3. On confirm: call new RPC `mte.prepareWorkspace` `{ workspaceRoot: string; adapter: 'claude'|'opencode'|'codex' }`
   → `{ configPath: string; status: string }` (main method in a new file
   `src/main/runtime/rpc/methods/mte.ts`, permission `'workspace'`, implemented by calling
   `planWorkspaceMcpConfig({ adapter, workspaceRoot, orcaCliCommand, role: 'orchestrator' })` +
   `applyWorkspaceMcpConfig`, reusing `resolveMteStartCliCommand` logic moved/exported from
   `src/shared/mte/cli-command.ts` if it is CLI-only today). Register it next to the other runtime RPC
   methods (find the registry where `agent-launch.ts` is listed). Then call `launchAgentInNewTab` with
   `prompt: plannerKickoffPrompt(MTE_START_DEFAULT_GOAL)` (export the default goal from
   `src/shared/mte/planner-prompt.ts`, re-export from the CLI handler), `promptDelivery: 'submit-after-ready'`,
   `launchSource` unchanged. Then `toast.message(t('mte.planner.started'))` = "MTE planner started in <agent label>".
   On RPC failure: `toast.error(...)` with the message and launch the plain chat anyway.
4. On cancel: plain chat as today.
5. RepositoryPane: a switch "Ask to use MTE orchestration on new chats" bound to `mteFlowPrompt`
   (checked = `'ask'`), with search entry.

## Out of scope

CLI changes; the final deploy-check step (T-0010); other launch entry points (keyboard shortcut,
cmd-j, split) keep current behaviour.

## Deliverables

| File                                                                                                                                       | Change                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/repo-types.ts`                                                                                                                 | `mteFlowPrompt?: 'ask' \| 'never'`                                                                                                                                   |
| `src/renderer/src/store/repos/repo-state.ts`, `src/shared/rpc-contract/repo-update-params.ts`, `src/main/ipc/repos/repo-update-handler.ts` | accept the key                                                                                                                                                       |
| `src/shared/mte/planner-prompt.ts`                                                                                                         | export `MTE_START_DEFAULT_GOAL` (move from CLI handler, CLI re-exports)                                                                                              |
| `src/shared/mte/adapter-for-agent.ts` (new)                                                                                                | `export function mteAdapterForAgent(agent: string): 'claude'\|'opencode'\|'codex'\|null` + test                                                                      |
| `src/main/runtime/rpc/methods/mte.ts` (new)                                                                                                | `mte.prepareWorkspace` + registration                                                                                                                                |
| `src/shared/rpc-contract/...`                                                                                                              | params schema for `mte.prepareWorkspace` (follow the pattern of neighbouring contracts)                                                                              |
| `src/renderer/src/components/tab-bar/QuickLaunchButton.tsx`                                                                                | dialog + MTE launch in `runLaunch` (extract to `use-mte-flow-launch-prompt.ts` in the same folder to respect the 300-line budget)                                    |
| `src/renderer/src/components/settings/repository/RepositoryPane.tsx` + `repository-search.ts`                                              | switch                                                                                                                                                               |
| i18n locales + runtime catalog                                                                                                             | keys under `mte.*` and `settings.repository.mteFlowPrompt.*`                                                                                                         |
| tests                                                                                                                                      | `mteAdapterForAgent` unit test; a renderer test for the hook: never → no dialog; ask+cancel → plain launch; ask+confirm → RPC called then launch with planner prompt |

## Acceptance criteria

- New chat in a repo worktree with Claude shows the dialog once; "don't ask again" persists `mteFlowPrompt: 'never'` and the dialog no longer appears; the Repository settings switch re-enables it.
- Confirm → `.mcp.json` (claude) / `opencode.json` (opencode) written in the workspace root, chat opens with the planner prompt submitted, toast shown.
- Non-MTE agents and folder/floating workspaces never show the dialog.
- `node config/scripts/run-vitest.mjs <changed test files>` green; `pnpm tc:node` green; `npx oxlint` and `npx oxfmt --check` clean on changed files; localization verify scripts pass.

## Constraints

- 300 non-test lines max per `.ts/.tsx` (oxlint max-lines). No arbitrary font sizes in native-chat. No dynamic className on `Button`.
- Code/comments/i18n keys in English. Spanish copy in `es.json` only.
- Do not commit. Report changed files.

## Q&A log

(empty)

## Run log

| attempt | role | result | notes |
| ------- | ---- | ------ | ----- |
| 1 | coder | TASK_READY_FOR_VALIDATION | Deviations accepted: extra allowlist files (repo-update-operations, repo-lifecycle-operations), resolveMteStartCliCommand moved to shared, useContext for confirm, RepositoryMteFlowPromptSection extracted; QuickLaunchButton max-lines pre-existing |
| 1 | validator | VALIDATION_FAILED | repository-search.ts 302 lines; QuickLaunchButton.tsx +31 lines (461>400 grandfathered 430); language-servers test = pre-existing at HEAD (memory: mock lacks getRepo) — not attributable |
| 2 | coder | TASK_READY_FOR_VALIDATION | search entries extracted (repository-search.ts 280); QuickLaunchButton +10 (pre-existing >400, ratchet OK) |
| 2 | validator | VALIDATION_FAILED | unicorn/no-useless-fallback-in-spread QuickLaunchButton.tsx:112; en-runtime-required.json missing 3 keyword keys (needs sync:localization-runtime-catalog). max-lines 409 grandfathered (ratchet OK) and language-servers test pre-existing → accepted. 2nd strike → mte-coder-hi |
| 3 | coder-hi | TASK_READY_FOR_VALIDATION | `...mte` spread; runtime catalog regenerated (+5) |
| 3 | validator | VALIDATION_FAILED→accepted as PASSED | only remaining = grandfathered max-lines (ratchet green) + pre-existing language-servers test |
