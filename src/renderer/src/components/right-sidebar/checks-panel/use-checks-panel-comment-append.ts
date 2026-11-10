import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store/index'
import { readNativeChatComposerDraft } from '@/components/native-chat/drafts/native-chat-composer-draft-store'
import { structuredAgentSessionDraftScopeKey } from '@/components/native-chat/drafts/native-chat-draft-scope'
import { insertNativeChatComposerDraftText } from '@/components/native-chat/drafts/native-chat-composer-draft-insertion'
import { activateStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import { visibleStructuredChatTab } from '@/lib/agent-session/visible-structured-chat-tab'

/** Appends the prompt to the visible chat's composer (never sends). Returns false when no chat exists. */
export function appendCommentsPromptToVisibleChat(
  worktreeId: string,
  prompt: string,
  count: number
): boolean {
  const chat = visibleStructuredChatTab(useAppStore.getState(), worktreeId)
  if (!chat) {
    return false
  }
  // Why: NativeChatStructuredSession mounts its composer with this conversation-scoped key.
  const scope = structuredAgentSessionDraftScopeKey(chat.sessionId)
  const existing = readNativeChatComposerDraft(scope).text.trimEnd()
  insertNativeChatComposerDraftText(scope, existing ? `\n\n${prompt}` : prompt)
  activateStructuredAgentSessionTab({ worktreeId, tabId: chat.tabId })
  toast.message(
    translate(
      'checksPanel.comments.addedToChat',
      'Added {{count}} comment groups to the chat input',
      { count }
    )
  )
  return true
}
