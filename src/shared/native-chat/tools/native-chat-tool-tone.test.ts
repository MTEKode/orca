import { describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_TOOL_TONE_CLASSES,
  nativeChatToolTone,
  type NativeChatToolTone
} from './native-chat-tool-tone'
import type { NativeChatToolCategory } from './native-chat-tool-icon'

describe('nativeChatToolTone', () => {
  it.each<[NativeChatToolCategory, boolean, NativeChatToolTone]>([
    ['read', false, 'read'],
    ['search', false, 'read'],
    ['listFiles', false, 'read'],
    ['fileChange', false, 'edit'],
    ['webSearch', false, 'web'],
    ['browser', true, 'web'],
    ['mcpToolCall', false, 'agent'],
    ['subAgentActivity', false, 'agent'],
    ['todoList', false, 'agent'],
    ['unknown', true, 'run'],
    ['unknown', false, 'neutral'],
    ['other', true, 'run'],
    ['other', false, 'neutral']
  ])('maps %s (shell=%s) to %s', (category, shell, tone) => {
    expect(nativeChatToolTone(category, shell)).toBe(tone)
  })

  it('has static surface and border classes per tone', () => {
    for (const [tone, classes] of Object.entries(NATIVE_CHAT_TOOL_TONE_CLASSES)) {
      expect(classes).toBe(`bg-chat-action-${tone}-surface border-chat-action-${tone}-border`)
    }
  })
})
