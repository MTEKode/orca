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
import type { AgentPickerEntry } from '../../../../shared/agent-launch/picker/agent-launch-picker'
import type { NewChatPick } from '../../../../shared/new-chat-defaults'
import { newChatEfforts, newChatModels, resolveNewChatPick } from './new-chat-pick'

/** Model select for one harness plus the effort select its chosen model offers. */
export function NewChatModelFields({
  id,
  label,
  entry,
  value,
  onChange,
  disabled
}: {
  id: string
  /** Heading for pickers whose harness is chosen in its own control. */
  label?: string
  entry: AgentPickerEntry | undefined
  value: NewChatPick | null
  onChange: (pick: NewChatPick) => void
  disabled?: boolean
}): React.JSX.Element | null {
  const models = newChatModels(entry)
  if (!entry || models.length === 0) {
    return null
  }
  const efforts = newChatEfforts(entry, value?.model)
  const choose = (patch: NewChatPick): void => {
    // Re-resolve so the effort snaps to the choices of the newly picked model.
    const resolved = resolveNewChatPick([entry], patch)
    if (resolved) {
      onChange({ agent: resolved.agent, model: resolved.model, effort: resolved.effort })
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label ? <Label>{label}</Label> : null}
      <Select
        disabled={disabled}
        value={value?.model}
        onValueChange={(model) => choose({ agent: entry.agent, model })}
      >
        <SelectTrigger
          id={`${id}-model`}
          className="min-w-0 w-full"
          size="sm"
          aria-label={translate('newChat.model', 'Model')}
        >
          <SelectValue placeholder={translate('newChat.model', 'Model')} />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {efforts.length > 0 && value?.model ? (
        <Select
          disabled={disabled}
          value={value.effort}
          onValueChange={(effort) => choose({ agent: entry.agent, model: value.model, effort })}
        >
          <SelectTrigger
            id={`${id}-effort`}
            className="min-w-0 w-full"
            size="sm"
            aria-label={translate('newChat.effort', 'Effort')}
          >
            <SelectValue placeholder={translate('newChat.effort', 'Effort')} />
          </SelectTrigger>
          <SelectContent>
            {efforts.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  )
}
