# T-0104 — Hand-off dialog: pick the model and effort

## Goal

"Hand Off to Another Agent" opens a fresh chat on the target harness. It could only
choose the harness and the context mode, so the new chat always inherited whatever the
host had saved. This task gives the handoff the same model and effort choice the New
Chat modal (T-0103) already offers.

## Requirements

- R1 — When the handoff route is a chat (`structured-native-chat`), the dialog shows a
  model select for the picked harness and the effort select its chosen model offers.
  A terminal route shows neither: it keeps the CLI's saved profile.
- R2 — The control prefills from the repo's own New Chat default (`newChatDefaults.chat`)
  when its agent matches the target agent; otherwise it resolves the model catalog's
  default. Switching harness or model re-snaps the effort to the new model's choices.
- R3 — Start sends the picked model and effort as the launch's explicit chat options
  (`launchOptions`), so they beat saved host defaults for `agentSession.create`.
  The continuation launch accepts them and carries them into the structured request.
- R4 — Text comes from the shared `newChat.model` / `newChat.effort` keys; no new copy.
- R5 — The model/effort control is shared with the New Chat modal's effort select
  (`newChatModels` / `newChatEfforts`), not a copy.

## Files

- `src/renderer/src/components/tab-bar/NewChatModelFields.tsx` (new): one harness's model
  and effort selects.
- `src/renderer/src/components/tab-bar/new-chat-pick.ts`: `newChatModels`, `newChatEfforts`.
- `src/renderer/src/components/agent-session-continuation/use-continuation-model-pick.ts`
  (new): inventory entry + prefill + launch options for the handoff target.
- `src/renderer/src/components/agent-session-continuation/ContinuationChatPickFields.tsx`
  (new): dialog-side wrapper carrying the picked surface.
- `src/renderer/src/components/agent-session-continuation/AgentSessionContinuationDialog.tsx`:
  renders the fields on chat routes and forwards the options on Start.
- `src/renderer/src/lib/launch-agent-session-continuation.ts`: `launchOptions` argument.

## Acceptance

- Targeted vitest for `agent-session-continuation` and `tab-bar` passes.
- `pnpm tc:web` and `pnpm tc:node` pass; oxlint/oxfmt clean on touched files.
- Handoff dialog test asserts the field appears on a chat route and that Start carries
  `launchOptions: { model, effort }` from the repo's saved chat pick.
