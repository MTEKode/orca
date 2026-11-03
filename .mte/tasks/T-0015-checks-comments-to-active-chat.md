# T-0015 — Check tab: "send PR comments" appends to the active chat input

Goal item 7 of batch 2 (lock: `.mte/memory/requirements-lock-batch2.md`).

## Context

- Buttons in `src/renderer/src/components/right-sidebar/checks-panel/comments-list.tsx:118,160` → `handleResolveCommentsWithAI(selectedGroups)` in `checks-panel/use-checks-panel-ai-queue.tsx:158-283`, which builds the prompt with `buildPRCommentsResolutionPrompt(...)` (`src/shared/github/pr-comments-resolution-prompt.ts`) and calls `openOrStart({actionId:'resolveComments', ..., prompt, commentResolution})` → starts a NEW agent with `promptDelivery: 'submit-after-ready'` (`use-saved-source-control-action-start.ts:39`).
- Draft insertion API: `insertNativeChatComposerDraftText(scope, text, {paste?, owner?})` in `components/native-chat/native-chat-composer-draft-insertion.ts:14` (types into a mounted composer or appends to the stored draft). Scope keys: pane key `structuredAgentSessionPaneKey(tabId, sessionId)` (`src/shared/agent-session/view/structured-agent-session-projection.ts:327`) is what `NativeChatComposerPane` mounts; `structuredAgentSessionDraftScopeKey(sessionId)` is the conversation-scoped key used by `NativeChatStructuredSession.tsx:394`. Determine which one the mounted composer registers (see `nativeChatComposerScopeDestination`) and use that.
- Active chat: chats are unified tabs with `contentType === 'agent-session'` in `unifiedTabsByWorktree[worktreeId]`, `entityId` = session id; active pane `activeGroupIdByWorktree[worktreeId]`, that group's active tab in `groupsByWorktree` (`store/slices/tabs/tabs-slice-contract.ts:28-31`). Helpers `getStructuredAgentSessionTabs`, `findStructuredAgentSessionTab` (`lib/agent-session/structured-agent-session-tab-activation.ts:14`).

## Behaviour

- In `handleResolveCommentsWithAI` (and only there; conflicts flow unchanged): after building the prompt, resolve the **visible chat** of `activeWorktreeId`: the active tab of the active group if it is an `agent-session`; else the first `agent-session` tab in the active group; else the first `agent-session` tab in the worktree (activate it). If found: `insertNativeChatComposerDraftText(scope, prompt)` — appended after existing draft text with a blank line separator, NOT sent; activate/focus that tab; `toast.message(t('checks.comments.addedToChat', {count}))`. If no chat exists: current `openOrStart` path (new chat).
- Extract the resolution into a pure helper `visibleStructuredChatTab(state, worktreeId): {tabId, sessionId, groupId} | null` in `src/renderer/src/lib/agent-session/visible-structured-chat-tab.ts` + test.
- Known trade-off (record in report): the `commentResolution` follow-up metadata (auto reply/resolve on GitHub/GitLab after the agent finishes) only applies to the new-chat path; the appended prompt text still contains the reply instructions.

## Deliverables

| File                                                                        | Change                                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/renderer/src/lib/agent-session/visible-structured-chat-tab.ts` (+test) | helper                                                                                                           |
| `checks-panel/use-checks-panel-ai-queue.tsx`                                | append path (extract to `use-checks-panel-comment-append.ts` if size requires)                                   |
| i18n                                                                        | toast key                                                                                                        |
| tests                                                                       | hook test: with a visible chat → draft insertion called with the prompt and no `start`; without → `start` called |

## Acceptance criteria

- With a chat open in the workspace, both buttons append the comments prompt to its composer and do not create a chat; the user can edit and send.
- With no chat, behaviour is unchanged.
- Lint/format/typecheck/tests green. Do not commit.

## Q&A log

(empty)

## Run log

| attempt | role      | result                    | notes                                                                                                                                                                               |
| ------- | --------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | coder     | TASK_READY_FOR_VALIDATION | key checksPanel.comments.addedToChat (deviation accepted); pane-key scope; \n\n separator                                                                                           |
| 1       | validator | VALIDATION_FAILED         | scope key likely wrong (pane key vs structuredAgentSessionDraftScopeKey at NativeChatStructuredSession.tsx:394); oxfmt on comment-append.ts (validator accidentally ran write mode) |
| 2       | coder     | TASK_READY_FOR_VALIDATION | scope = structuredAgentSessionDraftScopeKey(sessionId) (verified: no aliasing); oxfmt clean                                                                                         |
| 2       | validator | VALIDATION_FAILED         | oxlint consistent-type-imports in use-checks-panel-ai-queue.test.tsx:31 (import() type annotation). 2nd strike → escalate to mte-coder-hi                                           |
| 3       | coder-hi  | TASK_READY_FOR_VALIDATION | replaced inline `typeof import(...)` with `import type * as DraftStoreModule`; 5 files oxlint/anti-slop/oxfmt clean; vitest 26 files/264 tests pass; tc:web clean                   |
| 3 | validator | VALIDATION_PASSED | 264 tests, lint/format/tc clean |
