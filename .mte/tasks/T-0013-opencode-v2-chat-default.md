# T-0013 — OpenCode v2 chat: visible by default, agent (build/plan) selection, forms/questions

Goal item 5 of batch 2 (lock: `.mte/memory/requirements-lock-batch2.md`).

## Context (audit 2026-11-03)

The v2 HTTP/SSE transport already exists in `src/main/opencode-v2/` (T-0014 phase 1, commit b535082f69): separate agent id `'opencode-v2'` (`opencode-v2-agent-definition.ts`), hidden unless `experimentalOpenCodeV2Chat` (`src/shared/opencode-v2-chat-settings.ts`, default `false` in `src/shared/default-global-settings.ts:277`, gate `opencode-v2-gate.ts`, installed in `src/main/runtime/structured-agent-availability.ts:117`, visibility `structuredAgentVisibleWithSettings` used in `rpc/methods/structured-agent-session-agents.ts:13` and `session-tabs/structured-session-create-support.ts:22`; toggle in `components/settings/ExperimentalPane.tsx:290-310`; label `src/shared/agent-type-label.ts:17`).
DONE: session create/resume, prompt (steer), interrupt, permissions, models + setModel, usage/context, compaction, history reload, errors, service discovery (`opencode-v2-service.ts`, Service.ensure, 2.x).
MISSING: agent selection (only `model` option key accepted — `opencode-v2-dispatch.ts:183`, `agent-definition.ts:23`), efforts/variants (`opencode-v2-models.ts:38` `efforts: []`), forms/questions (no `question.*`/`form.*` events in `opencode-v2-events.ts:20-38`; `answer()` only handles permissions in `opencode-v2-session-adapter.ts`), terminal-row adoption, WSL, rewind.
API facts (memory `opencode-v2-http-api-surface`): `GET /api/agent?location[directory]=` lists agents; `POST /api/session/{id}/agent {agent}`; forms `GET/POST /api/session/{id}/form`, reply `POST .../form/{formID}/reply {answer}`, events `form.created/replied/cancelled`; `Model.Ref {providerID, id, variant?}`; `Model.Info` may carry variants — check the generated types in `node_modules/@opencode/client`.
Tests: `npx vitest run --config config/vitest.config.ts src/main/opencode-v2`; golden SSE fixtures in `src/main/opencode-v2/fixtures/*.jsonl` + `opencode-v2.test-support.ts`.

## Behaviour

1. **Default on**: `experimentalOpenCodeV2Chat` default → `true`; keep the Experimental toggle (rename copy to "OpenCode v2 chat (HTTP transport)"). Label stays distinguishable ("OpenCode v2"). ACP `opencode` agent remains available.
2. **Agent option**: new session option key `agent` (select) listing agents from `GET /api/agent` for the session directory (fields: name, description; mark the default/primary). `setOption('agent', name)` → `POST /api/session/{id}/agent`. Expose it in `readOptions` so the composer option pickers show it (follow how `model` is exposed; the picker UI is generic `NativeChatSessionOptionPickers`).
3. **Efforts/variants**: if `Model.Info` exposes variants in the installed client types, map them to `efforts` on `AgentSessionModelOption` and send `variant` in the model ref; else leave `efforts: []` and record the reason in the report.
4. **Forms**: subscribe `form.created/replied/cancelled`; translate `form.created` into the existing question-prompt timeline shape (look at how ACP questions become `kind: 'question'` prompts in `src/main/acp/acp-timeline-requests.ts`); `answerPrompt({kind:'question'})` → `POST .../form/{formID}/reply`; cancel → `routePromptCancel` returns the right action. Add a `fixtures/opencode-v2-form.jsonl` golden script + test.

## Deliverables

| File                                                                                                                     | Change                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `src/shared/default-global-settings.ts`, `ExperimentalPane.tsx`, i18n                                                    | default + copy                                    |
| `src/main/opencode-v2/opencode-v2-agents.ts` (new)                                                                       | list agents → option choices + test               |
| `opencode-v2-connection.ts`, `opencode-v2-dispatch.ts`, `opencode-v2-agent-definition.ts`, `opencode-v2-session.ts`      | `agent` option                                    |
| `opencode-v2-models.ts` (+test)                                                                                          | variants → efforts (if available)                 |
| `opencode-v2-events.ts`, `opencode-v2-turn-translation.ts`, `opencode-v2-session-adapter.ts`, new `opencode-v2-forms.ts` | forms                                             |
| fixtures + tests                                                                                                         | form golden script; adapter test for agent option |

## Acceptance criteria

- Fresh settings show "OpenCode v2" in the New Chat agent list without touching Experimental.
- Composer shows an Agent picker for an OpenCode v2 session; choosing `plan` results in `POST /api/session/{id}/agent {agent:'plan'}` (test with injected fetch).
- A `form.created` SSE event renders a question prompt; answering posts the reply (golden test).
- All `src/main/opencode-v2` tests + lint/format/typecheck green. Do not commit.

## Q&A log

- Q (coder, attempt 1): shared option snapshot has fixed keys; Agent picker needs src/shared + renderer descriptor changes. Extend, or close on backend?
- A (orchestrator): Close T-0013 on the backend (setOption('agent'), agent listing, variants→efforts, forms). The composer Agent picker moves to follow-up T-0016 (extend `AgentSessionOptionsResult.current` with an optional generic select + descriptor), out of this batch. Acceptance criterion 2 is reduced to "setOption('agent','plan') posts to /api/session/{id}/agent (tested)".
- Deviations accepted: agent applied only via setOption (no executionOptions.agent); extra `effort` key + `session.agent.selected` subscription.

## Run log

| attempt | role  | result                    | notes                                   |
| ------- | ----- | ------------------------- | --------------------------------------- |
| 1       | coder | ASK_ORCHESTRATOR→answered | backend done, picker deferred to T-0016 |

> Follow-up T-0016 (not in this batch): composer Agent (build/plan) picker — extend AgentSessionOptionsResult.current + descriptor builder.
> | 1 | validator | VALIDATION_FAILED | opencode-v2-session.ts 316 lines (>300). Everything else green. |
> | 2 | coder | TASK_READY_FOR_VALIDATION | session.ts 296 lines via extractions into session-open.ts; picker question already answered (deferred to T-0016) |
> | 2 | validator | VALIDATION_PASSED | 99 tests, lint/format/tc clean |
