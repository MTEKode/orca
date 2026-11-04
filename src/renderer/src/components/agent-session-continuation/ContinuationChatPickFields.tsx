import React from 'react'
import { NewChatModelFields } from '@/components/tab-bar/NewChatModelFields'
import { translate } from '@/i18n/i18n'
import type { AgentLaunchSurface } from '@/lib/agent-session-launch-plan'
import type { AgentPickerEntry } from '../../../../shared/agent-launch-picker'
import type { NewChatPick } from '../../../../shared/new-chat-defaults'

/** The handoff's model and effort, shown while the target agent opens as a chat. */
export function ContinuationChatPickFields({
  entry,
  value,
  surface,
  disabled,
  onChange
}: {
  entry: AgentPickerEntry | undefined
  value: NewChatPick | null
  /** Keeps the surface the user already picked when only model or effort changes. */
  surface?: AgentLaunchSurface
  disabled?: boolean
  onChange: (pick: NewChatPick & { surface?: AgentLaunchSurface }) => void
}): React.JSX.Element {
  return (
    <NewChatModelFields
      id="agent-session-continuation"
      label={translate('newChat.model', 'Model')}
      entry={entry}
      value={value}
      disabled={disabled}
      onChange={(next) =>
        onChange({
          agent: next.agent,
          ...(surface ? { surface } : {}),
          ...(next.model ? { model: next.model } : {}),
          ...(next.effort ? { effort: next.effort } : {})
        })
      }
    />
  )
}
