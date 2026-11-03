# T-0012 — Pastel tones for tool/action blocks in native chat

Goal item 4 of batch 2 (lock: `.mte/memory/requirements-lock-batch2.md`).

## Context

- All four native providers render tool calls through shared components in `src/renderer/src/components/native-chat/`: `NativeChatToolLine.tsx:81` (one row; output block at :66 uses `border-chat-code-border bg-chat-code-surface`), `NativeChatToolRun.tsx:48` (folded group), `NativeChatToolIcon.tsx`.
- Shared category vocabulary: `NativeChatToolCategory` in `src/shared/native-chat/tools/native-chat-tool-icon.ts:10` (`read|search|listFiles|unknown|fileChange|webSearch|browser|mcpToolCall|subAgentActivity|todoList|other`), `nativeChatToolCategory(...)` :116, `nativeChatToolRunCategory` :142, `isShellActivityToolCall` :168.
- Tokens: Tailwind v4 CSS-first in `src/renderer/src/assets/main.css` — `@theme inline` :56-76 declares `--color-chat-*`; light values under `:root` :188, dark under `.dark` :405. Scoped overrides in `native-chat-appearance.css`.
- Rules: no arbitrary font sizes in native-chat; no dynamic className on `Button`; class strings must be static (map category → full class string, not interpolated).

## Behaviour

- Add tone tokens for five action tones: `read` (read/search/listFiles), `edit` (fileChange), `run` (shell activity), `web` (webSearch/browser), `agent` (mcpToolCall/subAgentActivity/todoList), `neutral` (unknown/other). Each has `--color-chat-action-<tone>-surface` and `--color-chat-action-<tone>-border`, pastel in light (e.g. soft blue/green/amber/violet/pink at ~8-12% tint) and muted in dark (same hues ~15% on the dark pane). Values are hand-picked constants; AA contrast of existing foreground text on each surface must hold (check with a quick contrast calc in the test or note the ratios in the report).
- New pure helper `src/shared/native-chat/tools/native-chat-tool-tone.ts`: `export type NativeChatToolTone = 'read'|'edit'|'run'|'web'|'agent'|'neutral'`, `nativeChatToolTone(category: NativeChatToolCategory, shell: boolean): NativeChatToolTone`, and `NATIVE_CHAT_TOOL_TONE_CLASSES: Record<NativeChatToolTone, string>` with static `bg-chat-action-<tone>-surface border-chat-action-<tone>-border` strings.
- Apply the tone classes to the row container in `NativeChatToolLine` and the group container in `NativeChatToolRun` (the output block keeps the code surface). Border stays 1px, radius unchanged; when a run is active (streaming), keep existing status glyphs.

## Deliverables

| File                                                                   | Change                                       |
| ---------------------------------------------------------------------- | -------------------------------------------- |
| `src/shared/native-chat/tools/native-chat-tool-tone.ts` (+ `.test.ts`) | helper + mapping tests for every category    |
| `src/renderer/src/assets/main.css`                                     | tokens (`@theme inline` + `:root` + `.dark`) |
| `NativeChatToolLine.tsx`, `NativeChatToolRun.tsx`                      | apply classes                                |
| existing component tests                                               | update snapshots if any                      |

## Acceptance criteria

- A read tool row renders with the read tone classes, a bash row with run tone, an edit with edit tone, in both schemes (test asserts class names).
- Light and dark screenshots of a chat with mixed tools look pastel/muted, not saturated (attach via `mcp__orca-component-fixtures__screenshot_fixture` if a fixture exists; else describe).
- Lint/format/typecheck/tests green. Do not commit.

## Q&A log

(empty)

## Run log

| attempt | role  | result                    | notes                                                                                                          |
| ------- | ----- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1       | coder | TASK_READY_FOR_VALIDATION | Tone applied to run header row only (deviation); vitest needs --config config/vitest.config.ts; no screenshots |
| 1 | validator | VALIDATION_FAILED | oxfmt --check fails on NativeChatToolLine.tsx:127-136; contrast ratios not noted in diff (report: .mte/tasks/T-0012.validation.md) |
| 2 | coder | TASK_READY_FOR_VALIDATION | oxfmt fixed; contrast table in main.css (≥7.1 light, ≥7.8 dark for chat-foreground; faint text pre-existing <4.5 on light) |
| 2 | validator | VALIDATION_PASSED | 406 tests, lint/format/tc clean |
