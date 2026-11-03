import type { NativeChatToolCategory } from './native-chat-tool-icon'

export type NativeChatToolTone = 'read' | 'edit' | 'run' | 'web' | 'agent' | 'neutral'

/** Static class strings so Tailwind can see every tone; never interpolate. */
export const NATIVE_CHAT_TOOL_TONE_CLASSES: Record<NativeChatToolTone, string> = {
  read: 'bg-chat-action-read-surface border-chat-action-read-border',
  edit: 'bg-chat-action-edit-surface border-chat-action-edit-border',
  run: 'bg-chat-action-run-surface border-chat-action-run-border',
  web: 'bg-chat-action-web-surface border-chat-action-web-border',
  agent: 'bg-chat-action-agent-surface border-chat-action-agent-border',
  neutral: 'bg-chat-action-neutral-surface border-chat-action-neutral-border'
}

/** Shell activity wins over the unclassified categories a bare command lands in. */
export function nativeChatToolTone(
  category: NativeChatToolCategory,
  shell: boolean
): NativeChatToolTone {
  switch (category) {
    case 'read':
    case 'search':
    case 'listFiles':
      return 'read'
    case 'fileChange':
      return 'edit'
    case 'webSearch':
    case 'browser':
      return 'web'
    case 'mcpToolCall':
    case 'subAgentActivity':
    case 'todoList':
      return 'agent'
    case 'unknown':
    case 'other':
      return shell ? 'run' : 'neutral'
  }
}
