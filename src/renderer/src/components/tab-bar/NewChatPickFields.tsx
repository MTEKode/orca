import React from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { NewChatEffortLabel, NewChatHarnessLabel } from './NewChatOptionIcons'
import type { AgentPickerEntry } from '../../../../shared/agent-launch-picker'
import type { NewChatPick } from '../../../../shared/new-chat-defaults'
import type { NewChatSelection } from './new-chat-dialog-store'
import {
  newChatEfforts,
  newChatModels,
  newChatPairValue,
  parseNewChatPairValue,
  resolveNewChatPick
} from './new-chat-pick'

/** Harness/model select plus the effort select that follows the chosen model. */
export function NewChatPickFields({
  id,
  title,
  entries,
  value,
  onChange
}: {
  id: string
  title?: string
  entries: readonly AgentPickerEntry[]
  value: NewChatSelection | null
  onChange: (pick: NewChatPick) => void
}): React.JSX.Element {
  const pairs = entries.flatMap((entry) => newChatModels(entry).map((model) => ({ entry, model })))
  const current = value?.model ? newChatPairValue(value.agent, value.model) : undefined
  const efforts = newChatEfforts(
    entries.find((entry) => entry.agent === value?.agent),
    value?.model
  )
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={title}>
      {title ? <Label>{title}</Label> : null}
      <Select
        value={current}
        onValueChange={(v) => {
          const next = parseNewChatPairValue(v)
          // Re-resolve so effort snaps to the new model's choices.
          const agent = entries.find((e) => e.agent === next.agent)?.agent
          const resolved = agent && resolveNewChatPick(entries, { agent, model: next.model })
          if (resolved) {
            onChange({ agent: resolved.agent, model: resolved.model, effort: resolved.effort })
          }
        }}
      >
        <SelectTrigger
          id={`${id}-model`}
          className="w-full"
          aria-label={translate('newChat.model', 'Model')}
        >
          <SelectValue placeholder={translate('newChat.model', 'Model')} />
        </SelectTrigger>
        <SelectContent>
          {pairs.map(({ entry, model }) => (
            <SelectItem
              key={newChatPairValue(entry.agent, model.id)}
              value={newChatPairValue(entry.agent, model.id)}
            >
              <NewChatHarnessLabel agent={entry.agent}>
                {`${entry.label} / ${model.label}`}
              </NewChatHarnessLabel>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {efforts.length > 0 && value ? (
        <Select
          value={value.effort}
          onValueChange={(effort) => onChange({ agent: value.agent, model: value.model, effort })}
        >
          <SelectTrigger
            id={`${id}-effort`}
            className="w-full"
            aria-label={translate('newChat.effort', 'Effort')}
          >
            <SelectValue placeholder={translate('newChat.effort', 'Effort')} />
          </SelectTrigger>
          <SelectContent>
            {efforts.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <NewChatEffortLabel value={c.value}>{c.label}</NewChatEffortLabel>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  )
}
