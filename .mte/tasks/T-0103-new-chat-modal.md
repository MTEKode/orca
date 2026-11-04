# T-0103 — Unified New Chat modal (harness+model+effort, orchestration mode pins orchestrator and worker)

## Context

Depends on T-0101 (merged): `MTE_ORCHESTRATION_AGENTS`, `MteWorkerPin`, `mteAdapterForAgent` (4 agents), `plannerKickoffPrompt(goal, worker?)`, `mte.markPlanner {sessionId, worker?}`, and `agentSession.create` / `agent.launch` params accepting `mteRole` + `mteWorker`.

Current renderer flow (verified 2026-11-04):

- New Chat entry: `src/renderer/src/components/tab-bar/QuickLaunchButton.tsx` → `useTabAgentMenuLaunch` → rows from `useNewTabAgentMenuRows` → `SubscribedAgentLaunchPickerMenu` (`src/renderer/src/components/agent/AgentLaunchPickerMenu.tsx`, `onUse` line ~198 calls `runLaunch(pickerLaunchRow(entry, draft.surface), draft, entry)`). The picker's side panel `AgentLaunchSetupPanel.tsx` already lists models (lines ~200-275) and option rows incl. `effort` (falls back to `liveModel?.defaultEffort`). Draft type `AgentPickerDraft {agent, surface, choices, arguments?, prompt?}` in `src/shared/agent-launch-picker.ts`; `agentPickerLaunchInputs(draft, entry)` → `sessionOptions` consumed by `launchAgentInNewTab` (`src/renderer/src/lib/launch-agent-in-new-tab.ts`). Picker entries/catalog come from `use-agent-launch-picker-inventory.ts` (`agentSession.modelCatalog` with static fallback — reuse it; do not add another catalog fetch).
- MTE gate: `use-mte-flow-launch-prompt.ts` (`promptMteFlowLaunch`, `useMteFlowLaunchPrompt`), dialog `MteStartDialog.tsx` + zustand `mte-start-dialog-store.ts` (`MteStartChoice`: plain | mte{goal, items, dontAskAgain}). On mte: `mte.prepareWorkspace {workspaceRoot, adapter}` → `launchAgentInNewTab({prompt: plannerKickoffPrompt(mteStartGoal(goal, items)), promptDelivery:'submit-after-ready'})` → `markMtePlannerSession` calls `mte.markPlanner` after settlement.
- Repo setting precedent: `mteFlowPrompt?: 'ask'|'never'` in `src/shared/repo-types.ts`, zod in `src/shared/rpc-contract/repo-update-params.ts`, allow-lists in `src/main/persistence/loading-store/repo-lifecycle-operations.ts`, `src/main/persistence/tracking-repos/repo-update-operations.ts`, `src/main/ipc/repos/repo-update-handler.ts`. Renderer updates via `updateRepo(repoId, {...})`.
- i18n: renderer strings go through `translate(key, fallback)`; generated catalogs under `src/renderer/src/i18n/` (en.json first, then verify, then `generate-runtime-required-english-catalog` — check package.json scripts and run them in that order if a key must be added).
- Design lint gates: no arbitrary font sizes in native-chat, no restyle/dynamic className on `Button`.

## Deliverables

1. New component `src/renderer/src/components/tab-bar/NewChatDialog.tsx` (+ store `new-chat-dialog-store.ts`, same open/settle promise pattern as `mte-start-dialog-store.ts`) replacing `MteStartDialog` as the entry for New Chat (`row.kind === 'chat'` launches from the tab bar / quick launch). Delete `MteStartDialog.tsx` and `mte-start-dialog-store.ts` once nothing imports them. Fields:
   - Checkbox "Orchestration mode" (`translate('newChat.orchestration', 'Orchestration mode')`).
   - Off: one "Model" select of harness/model pairs (label `<Harness label> / <model label>`, value `{agent, model}`) built from every installed agent's picker entry + catalog; one "Effort" select from the chosen model's `efforts` (hidden when the model has none). Installed = present in the picker inventory the menu already uses.
   - On: two blocks "Orchestrator" and "Worker", each with the same pair+effort selects but restricted to agents in `MTE_ORCHESTRATION_AGENTS`; plus goal textarea and Linear/PR items exactly as `MteStartDialog` had (reuse its pieces); drop the "don't ask again" checkbox (the mode is now an explicit choice; `repo.mteFlowPrompt` keeps being respected only to hide the checkbox when `'never'`).
   - Orchestration checkbox is hidden/disabled (with the existing reasons) when `promptMteFlowLaunch` would have returned false today: no adapter for the agent is no longer a reason; remaining reasons are folder repo, `repo.connectionId` set (remote), non git-worktree, or no workspaceRoot.
   - Buttons: Start (primary), Cancel. Start is never blocked by a missing live catalog: static fallback entries are used and a muted note `translate('newChat.catalogFallback', 'Model list may be incomplete')` is shown when the inventory reports fallback/pending.
2. Persisted defaults per repo: new repo field `newChatDefaults?: { orchestration: boolean; chat?: {agent; model?; effort?}; orchestrator?: {agent; model?; effort?}; worker?: {agent; model?; effort?} }` in `repo-types.ts`, zod in `repo-update-params.ts` (strict, strings ≤ 128, agent validated as a known agent id via the existing agent id schema if one exists), added to the three allow-lists above and sanitised in `repo-update-handler.ts` like `mteFlowPrompt`. The dialog preselects from it (falling back to `defaultTuiAgent` + the catalog default model) and saves it on Start.
3. Launch wiring (in `use-mte-flow-launch-prompt.ts`, rename to `use-new-chat-launch.ts` if cleaner):
   - Off: build an `AgentPickerDraft` for the chosen agent with `choices.model` and `choices.options.effort` (mirror how `AgentLaunchSetupPanel` writes them) and call the existing `runLaunch(row, draft, entry)` path so `sessionOptions` reach the host exactly as the panel does today.
   - On: `mte.prepareWorkspace {workspaceRoot, adapter: mteAdapterForAgent(orchestrator.agent)}`; launch the orchestrator with its draft (model/effort) plus `prompt: plannerKickoffPrompt(mteStartGoal(goal, items), worker)`, `promptDelivery: 'submit-after-ready'`, and pass `mteRole: 'planner'` + `mteWorker: worker` through `launchAgentInNewTab` into the `agentSession.create` params (add the two optional fields to the renderer intent type). Keep `markMtePlannerSession` as a fallback that now also sends `worker`. Toast as today.
4. Remove `mteAdapterForAgent`-based gating from the menu path so non-adapter agents still open plain chats; MTE is only offered inside the dialog.
5. Tests (vitest, `--config config/vitest.config.ts`): `NewChatDialog.test.tsx` (renders pairs from a fake inventory; toggling orchestration shows two blocks limited to the four agents; effort select follows model `efforts`; Start with fallback catalog still enabled; Start returns the expected choice object) and a test for the launch wiring that asserts prepareWorkspace adapter, the kickoff prompt contains the worker pin, and `mteWorker`/`mteRole` reach the launch call. Update any test that imported `MteStartDialog` / `promptMteFlowLaunch`.

## Constraints

- Reuse existing UI primitives (`@/components/ui/*` select/checkbox/dialog/button). No new dependencies. No arbitrary font sizes; no dynamic className on `Button`.
- Touch main-process files only for the repo field plumbing (deliverable 2). Do not change planner-prompt, CLI, or ACP code.
- Run targeted vitest, oxlint and oxfmt on touched files. No full suite, no tsc, no build. 300-line max-lines on non-test .ts/.tsx: split components/hooks rather than wrap.
- If an i18n key must be added, run the catalog scripts in the documented order; otherwise rely on `translate(key, fallback)` and say so.
- Commit on the current branch; no push.
- Unclear host-side behaviour (e.g. whether `agentSession.create` accepts `mteWorker` after T-0101)? Ask the planner with `orca orchestration ask` rather than guessing.

## Acceptance

- Manual (planner/user will verify later; document steps in the final report): New Chat → modal shows pairs; choosing opencode/qwen3.8 opens a plain opencode chat on that model; enabling orchestration and choosing claude/sonnet as orchestrator + opencode/qwen3.8 medium as worker opens a planner whose first message does not ask which agent runs the workers and whose session record has `mteWorker`.
- Reopening the modal preselects the last choice for that repo.
- Targeted vitest green; oxlint/oxfmt clean. Non-zero exit = task failed.
