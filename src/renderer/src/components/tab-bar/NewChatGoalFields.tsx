import React, { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import {
  parseWorkspaceAttachmentInput,
  workspaceAttachmentLabel,
  workspaceAttachmentProviderLabel
} from '@/components/sidebar/worktree-attachment-editing'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'

export function itemKey(item: WorkspaceAttachment): string {
  return `${item.provider}:${item.type}:${item.identifier ?? item.number}`
}

function itemLabel(item: WorkspaceAttachment): string {
  const ref = item.identifier ?? workspaceAttachmentLabel(item)
  return `${workspaceAttachmentProviderLabel(item)} ${ref}${item.title ? ` — ${item.title}` : ''}`
}

/** Orchestration goal textarea plus linked Linear/PR items; reports the selected items upward. */
export function NewChatGoalFields({
  goal,
  onGoalChange,
  initialItems,
  onItemsChange
}: {
  goal: string
  onGoalChange: (goal: string) => void
  initialItems: readonly WorkspaceAttachment[]
  onItemsChange: (items: WorkspaceAttachment[]) => void
}): React.JSX.Element {
  const [items, setItems] = useState<WorkspaceAttachment[]>([...initialItems])
  const [checked, setChecked] = useState<Set<string>>(new Set(initialItems.map(itemKey)))
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState(false)

  const update = (nextItems: WorkspaceAttachment[], nextChecked: Set<string>): void => {
    setItems(nextItems)
    setChecked(nextChecked)
    onItemsChange(nextItems.filter((i) => nextChecked.has(itemKey(i))))
  }

  const addLink = (): void => {
    const parsed =
      parseWorkspaceAttachmentInput(link, 'linear-issue') ??
      parseWorkspaceAttachmentInput(link, 'github-pr')
    if (!parsed) {
      setLinkError(link.trim().length > 0)
      return
    }
    const key = itemKey(parsed)
    update(
      items.some((i) => itemKey(i) === key) ? items : [...items, parsed],
      new Set(checked).add(key)
    )
    setLink('')
    setLinkError(false)
  }

  const toggle = (key: string, on: boolean): void => {
    const next = new Set(checked)
    if (on) {
      next.add(key)
    } else {
      next.delete(key)
    }
    update(items, next)
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-chat-goal">{translate('mte.start.goalLabel', 'Goal')}</Label>
        <Textarea
          id="new-chat-goal"
          rows={4}
          value={goal}
          onChange={(e) => onGoalChange(e.target.value)}
          placeholder={translate(
            'mte.start.goalPlaceholder',
            'What should this run deliver? Leave empty and the planner will ask.'
          )}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{translate('mte.start.linksLabel', 'Linked Linear issues and pull requests')}</Label>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {translate('mte.start.noLinks', 'Nothing linked to this workspace yet.')}
          </p>
        ) : (
          items.map((item) => {
            const key = itemKey(item)
            return (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked.has(key)}
                  onCheckedChange={(v) => toggle(key, v === true)}
                />
                <span className="truncate">{itemLabel(item)}</span>
              </label>
            )
          })
        )}
        <Input
          value={link}
          aria-invalid={linkError}
          onChange={(e) => setLink(e.target.value)}
          onBlur={addLink}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addLink()
            }
          }}
          placeholder={translate(
            'mte.start.linkPlaceholder',
            'Add by identifier or URL: ENG-123, #45, https://…'
          )}
        />
      </div>
    </>
  )
}
