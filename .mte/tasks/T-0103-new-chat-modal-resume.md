# T-0103 (resume) — Finish the New Chat modal: launch wiring, call sites, create-time planner marker, tests

## Why this is a resume

The previous worker for `T-0103-new-chat-modal.md` died mid-task. Its uncommitted files are in the
worktree (`git status` at hand-off):

- Modified: `src/renderer/src/components/tab-bar/NewChatDialog.tsx`, `new-chat-dialog-store.ts`
  (renamed from `MteStartDialog.tsx` / `mte-start-dialog-store.ts`),
  `src/shared/repo-types.ts`, `src/shared/repo-update-params.ts`,
  `src/main/ipc/repos/repo-update-handler.ts`,
  `src/main/persistence/loading-store/repo-lifecycle-operations.ts`,
  `src/main/persistence/tracking-repos/repo-update-operations.ts`,
  `src/renderer/src/store/repos/repo-state.ts`
- New: `src/renderer/src/components/tab-bar/NewChatPickFields.tsx`, `NewChatGoalFields.tsx`,
  `new-chat-pick.ts`, `src/shared/new-chat-defaults.ts`
- Renamed but still holding the OLD code: `use-new-chat-launch.ts` (was `use-mte-flow-launch-prompt.ts`)
  and its test `use-new-chat-launch.test.ts`.

So the tree is currently broken: `App.tsx` imports the deleted `MteStartDialog`, and
`QuickLaunchButton.tsx` imports the old hook name from the old path.

Do not rewrite what is already there unless it is wrong. Read deliverable 1 of
`.mte/tasks/T-0103-new-chat-modal.md` for the intent of the components that already exist
(`NewChatDialog.tsx`, `NewChatPickFields.tsx`, `NewChatGoalFields.tsx`, `new-chat-pick.ts`,
`new-chat-dialog-store.ts`, `src/shared/new-chat-defaults.ts`) and only finish the gaps below.
`NewChatDialog.tsx` renders `NewChatPickFields` with `{id,title,entries,value,onChange}` and
`NewChatGoalFields` with `{goal,onGoalChange,initialItems,onItemsChange}`; keep those props stable
because the follow-up task (`T-0104`, hand-off dialog) will reuse `NewChatPickFields` and
`new-chat-pick.ts` unchanged.

## Remaining work

### R1 — Reusable launch draft helper (needed by T-0104)

In `src/renderer/src/components/tab-bar/new-chat-pick.ts` export:

```ts
export function newChatDraftForPick(
  selection: NewChatSelection | (NewChatPick & { entry: AgentPickerEntry }),
  surface: AgentPickerSurface = 'chat'
): AgentPickerDraft
```

It must produce `{ agent, surface, choices: { model?, options: { effort? } }, arguments: undefined }`
only from what the pick has (omit empty `options`/`model`), mirroring how
`AgentLaunchSetupPanel` writes model and effort into the draft. `agentPickerLaunchInputs(draft, entry)`
must then yield `sessionOptions.model` and `sessionOptions.effort`.

### R2 — Rewrite `use-new-chat-launch.ts` as the New Chat launch hook

File: `src/renderer/src/components/tab-bar/use-new-chat-launch.ts` (keep this filename).

- Replace `promptMteFlowLaunch` / `useMteFlowLaunchPrompt` with
  `useNewChatLaunch(worktreeId)` and a pure `openNewChatLaunch(deps)`; drop the
  `mteAdapterForAgent(...) === null` early return (deliverable 4: non-adapter agents open plain
  chats; orchestration is only offered inside the dialog).
- Keep the call shape `QuickLaunchButton.tsx` uses today:
  `tryLaunch([row, draft, pickerEntry], callerOwnsPrompt, (override) => runLaunch(row, draft, pickerEntry, override))`
  returning `true` when the dialog took over. Open the modal when
  `!callerOwnsPrompt && row.kind === 'chat' && !draft?.prompt`; return `false` otherwise so the
  caller launches normally.
- Build the request for `useNewChatDialogStore.getState().open({ worktreeId, linkedItems, orchestrationAvailable, defaults, initial })`:
  - `linkedItems` = `worktree.linkedItems`; `defaults` = `repo.newChatDefaults`;
    `initial` = the picker panel's current pick when it exists (`draft?.choices.model` +
    `draft.choices.options?.effort` + `row.agent`), else undefined.
  - `orchestrationAvailable` = `!!repo && !!workspaceRoot && !isFolderRepo(repo) &&
    !repo.connectionId && repo.mteFlowPrompt !== 'never' &&
    workspaceKindForWorktreeId(worktreeId) === 'git-worktree'` (adapter presence is NOT part of it).
- On `null` (cancel/escape): do nothing and report the launch as taken over.
- On `{ mode: 'chat' }`: persist `defaults` with
  `useAppStore.getState().updateRepo(repo.id, { newChatDefaults: defaults })`, resolve the row for the
  chosen agent (reuse the incoming `row` when `row.agent === choice.chat.agent`, else the chat row from
  `choice.chat.entry.rows.find((r) => r.kind === 'chat')`), build the draft with
  `newChatDraftForPick(choice.chat)` and call `launch(row, draft, choice.chat.entry)`.
- On `{ mode: 'mte' }`:
  1. `mte.prepareWorkspace { workspaceRoot, adapter: mteAdapterForAgent(orchestrator.agent) }` (same
     runtime target helper as today). On failure: toast `mte.prepare.failed` and launch the
     orchestrator as a plain chat with its draft (no planner marker), as today.
  2. Persist `defaults` first, then launch the orchestrator with its draft plus
     `prompt: plannerKickoffPrompt(mteStartGoal(goal, items), worker)`,
     `promptDelivery: 'submit-after-ready'`, `mteRole: 'planner'`, `mteWorker: worker`.
  3. Toast `mte.planner.started` with the orchestrator's agent label when the launch opened.
- `markMtePlannerSession` stays as a fallback for hosts that ignore the create-time marker, but it now
  takes the worker too and calls `mte.markPlanner { sessionId, mteWorker? }` (params already exist in
  `src/shared/rpc-contract/mte-worker-pin-params.ts`).

### R3 — Call sites

- `src/renderer/src/components/tab-bar/QuickLaunchButton.tsx`: import
  `markMtePlannerSession`, `useNewChatLaunch`, `RunLaunchArgs` from `./use-new-chat-launch`, rename the
  local `tryMte` to `tryNewChat`.
- `src/renderer/src/App.tsx`: mount `<NewChatDialog />` from
  `./components/tab-bar/NewChatDialog`.
- `src/renderer/src/components/tab-bar/QuickLaunchButton.launch-status.test.tsx`: update the
  `use-mte-flow-launch-prompt` module mock to `./use-new-chat-launch` exporting `useNewChatLaunch`.
- `grep -rn "MteStartDialog\|mte-start-dialog\|useMteFlowLaunchPrompt\|promptMteFlowLaunch" src` must end
  empty.

### R4 — Carry the planner marker to create time (no guessing; this is the gap the old worker skipped)

`StructuredAgentSessionCreateParams` already accepts `mteRole` / `mteWorker`
(`src/shared/agent-session/structured-agent-session-create.ts`), and `agent.launch` /
`agentSession.create` wire params carry them (`src/shared/rpc-contract/agent-launch-params.ts`,
`mte-worker-pin-params.ts`). The renderer never passes them. Thread two optional fields
`mteRole?: 'planner'` and `mteWorker?: MteWorkerPin` through the SAME path `launchOptions` already
takes, end to end:

1. `LaunchAgentInNewTabArgs` (`src/renderer/src/lib/launch-agent-in-new-tab-args.ts`) and
   `launchAgentInNewTabWithOutcome` (`src/renderer/src/lib/launch-agent-in-new-tab.ts`) — add the two
   optional args and include them in the route request next to `sessionOptions`/`launchOptions`.
2. `AgentSessionLaunchRequest` + `AgentSessionLaunchVerdict` (`src/renderer/src/lib/agent-session-launch-plan.ts`).
3. `StructuredAgentSessionLaunchOptions` (`src/renderer/src/lib/agent-session/launch/structured-agent-session-launch-callers.ts`) and
   `startStructuredAgentLaunch` (`src/renderer/src/lib/agent-session/launch/structured-agent-session-launch.ts`),
   which sets `intent.explicitLaunchOptions` around line 208 — set `intent.params.mteRole` /
   `intent.params.mteWorker` the same way.
4. Repeat them in `retryStructuredAgentSessionLaunchIntent` / `restoreStructuredAgentSessionLaunchIntent`
   only if those copies drop other params today (they rebuild `params` from
   `buildStructuredAgentSessionLaunchIntent`, so keep the marker on retries).
5. Terminal routes simply ignore the marker (they never set it); do not invent terminal behaviour.

If a route cannot carry the marker (e.g. the host `agent.launch` request builder needs it too and does
not have a slot), report it with `orca orchestration ask` instead of silently dropping it — the
fallback `mte.markPlanner` call must remain correct either way.

### R5 — Tests (vitest, targeted)

- Rewrite `src/renderer/src/components/tab-bar/use-new-chat-launch.test.ts` for the new hook/deps shape:
  cancel → nothing launched; chat choice → `launch` called with a draft whose
  `agentPickerLaunchInputs` yields `{model, effort}` and `updateRepo` saved `newChatDefaults`;
  mte choice → `mte.prepareWorkspace` received the orchestrator adapter,
  `plannerKickoffPrompt` text contains the worker pin, and the launch args carry
  `mteRole: 'planner'` + `mteWorker`; `mteFlowPrompt: 'never'` → `orchestrationAvailable` false;
  non-`chat` rows and caller-owned prompts → `false`.
- New `src/renderer/src/components/tab-bar/NewChatDialog.test.tsx` rendering `NewChatDialogForm` with a
  fake entries array (reuse the fixture style of `AgentLaunchSetupPanel.test.tsx` if one fits):
  pairs come from the inventory; toggling orchestration shows both blocks limited to the four
  `MTE_ORCHESTRATION_AGENTS`; the effort select follows the model's `efforts`; Start stays enabled
  with a fallback catalog and the muted note shows; Start settles the expected choice object;
  `orchestrationAvailable: false` hides the checkbox.
- Update any other test importing the removed dialog/hook names.

### R6 — Gates and commit

- Targeted tests only:
  `node config/scripts/run-vitest.mjs run --config config/vitest.config.ts \
   src/renderer/src/components/tab-bar src/renderer/src/components/agent-session-continuation --maxWorkers=2`
  (if the helper is unavailable, `pnpm test <the same paths> --maxWorkers=2`). Non-zero exit = task not done.
- `pnpm exec oxlint <touched files>` and `pnpm exec oxfmt --check <touched files>` (fix with `--write`).
- No `tsc`, no build, no full suite (the validator runs the repo-wide gates).
- `max-lines` 300 on non-test `.ts/.tsx`: split instead of wrapping.
- Commit everything you touched on the current branch, English message, `--no-verify` only if the
  pre-commit hook cannot run. Do NOT commit `.mcp.json` (local MCP config, not part of this task).

## Out of scope

- `AgentSessionContinuationDialog` / "Hand Off to Another Agent" — that is the follow-up `T-0104`.
  Just keep `NewChatPickFields` and `newChatDraftForPick` reusable for it.
- CLI parity, planner-prompt, ACP code (already merged in T-0101/T-0102).

## Acceptance

- `grep` for the removed Mte start names finds nothing.
- Targeted vitest green, oxlint/oxfmt clean on touched files.
- A bare New Chat click opens the modal; choosing opencode/qwen3.8 launches an opencode chat on that
  model; enabling orchestration and choosing claude/sonnet + opencode/qwen3.8/medium launches a planner
  whose launch args carry `mteRole`/`mteWorker` (document the manual steps in your report).
- Report with exactly one `mte` signal block: `TASK_READY_FOR_VALIDATION` (or `ASK_ORCHESTRATOR`).
