import React from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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
import type { AgentPickerEntry } from '../../../../shared/agent-launch/picker/agent-launch-picker'
import type { NewChatPick } from '../../../../shared/new-chat-defaults'
import type { NewChatSelection } from './new-chat-dialog-store'
import { newChatEfforts, newChatModels, resolveNewChatPick } from './new-chat-pick'

/** Harness/model select plus the effort select that follows the chosen model. */
export function NewChatPickFields({
  id,
  title,
  entries,
  value,
  onChange,
  onSelectAgent
}: {
  id: string
  title?: string
  entries: readonly AgentPickerEntry[]
  value: NewChatSelection | null
  onChange: (pick: NewChatPick) => void
  onSelectAgent?: (agent: AgentPickerEntry['agent']) => void
}): React.JSX.Element {
  const currentEntry = entries.find((entry) => entry.agent === value?.agent)
  const currentModels = newChatModels(currentEntry)
  const currentModel = currentModels.find((model) => model.id === value?.model)
  const selectedLabel =
    currentEntry && currentModel
      ? `${currentEntry.label} / ${currentModel.label}`
      : (currentEntry?.label ?? translate('newChat.model', 'Model'))
  const efforts = newChatEfforts(currentEntry, value?.model)
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={title}>
      {title ? <Label>{title}</Label> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            id={`${id}-model`}
            aria-label={translate('newChat.model', 'Model')}
            className="w-full justify-between font-normal"
          >
            <NewChatHarnessLabel agent={value?.agent}>{selectedLabel}</NewChatHarnessLabel>
            <ChevronDown className="size-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
          {entries.map((entry) => {
            const models = newChatModels(entry)
            return (
              <DropdownMenuSub key={entry.agent}>
                <DropdownMenuSubTrigger
                  onFocus={() => onSelectAgent?.(entry.agent)}
                  onPointerEnter={() => onSelectAgent?.(entry.agent)}
                >
                  <NewChatHarnessLabel agent={entry.agent}>{entry.label}</NewChatHarnessLabel>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {models.length > 0 ? (
                    models.map((model) => {
                      const selectModel = () => {
                        onSelectAgent?.(entry.agent)
                        const resolved = resolveNewChatPick(entries, {
                          agent: entry.agent,
                          model: model.id
                        })
                        if (resolved) {
                          onChange({
                            agent: resolved.agent,
                            model: resolved.model,
                            effort: resolved.effort
                          })
                        }
                      }
                      return (
                        <DropdownMenuItem
                          key={model.id}
                          onSelect={selectModel}
                          onClick={selectModel}
                        >
                          {model.label}
                        </DropdownMenuItem>
                      )
                    })
                  ) : (
                    <>
                      <DropdownMenuItem
                        onSelect={() => {
                          onSelectAgent?.(entry.agent)
                          const resolved = resolveNewChatPick(entries, { agent: entry.agent })
                          if (resolved) {
                            onChange({
                              agent: resolved.agent,
                              model: resolved.model,
                              effort: resolved.effort
                            })
                          }
                        }}
                        onClick={() => {
                          onSelectAgent?.(entry.agent)
                          const resolved = resolveNewChatPick(entries, { agent: entry.agent })
                          if (resolved) {
                            onChange({
                              agent: resolved.agent,
                              model: resolved.model,
                              effort: resolved.effort
                            })
                          }
                        }}
                      >
                        <NewChatHarnessLabel agent={entry.agent}>{entry.label}</NewChatHarnessLabel>
                      </DropdownMenuItem>
                      {entry.catalogRead === 'pending' || entry.catalog.origin === 'unknown' ? (
                        <DropdownMenuItem disabled>
                          {translate('newChat.loadingModels', 'Loading models…')}
                        </DropdownMenuItem>
                      ) : null}
                    </>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
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
