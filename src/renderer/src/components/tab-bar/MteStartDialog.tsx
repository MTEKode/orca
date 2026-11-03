import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import {
  parseWorkspaceAttachmentInput,
  workspaceAttachmentLabel,
  workspaceAttachmentProviderLabel
} from '@/components/sidebar/worktree-attachment-editing'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'
import { useMteStartDialogStore } from './mte-start-dialog-store'

function itemKey(item: WorkspaceAttachment): string {
  return `${item.provider}:${item.type}:${item.identifier ?? item.number}`
}

function itemLabel(item: WorkspaceAttachment): string {
  const ref = item.identifier ?? workspaceAttachmentLabel(item)
  return `${workspaceAttachmentProviderLabel(item)} ${ref}${item.title ? ` — ${item.title}` : ''}`
}

/** Start-of-chat modal: explains the MTE flow, takes a goal plus linked Linear/PR items. */
export const MteStartDialog = React.memo(function MteStartDialog() {
  useUiLanguageRevision()
  const pending = useMteStartDialogStore((s) => s.pending)
  const settle = useMteStartDialogStore((s) => s.settle)
  const [goal, setGoal] = useState('')
  const [items, setItems] = useState<WorkspaceAttachment[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState(false)
  const [dontAskAgain, setDontAskAgain] = useState(false)

  useEffect(() => {
    if (!pending) {
      return
    }
    setGoal('')
    setItems([...pending.linkedItems])
    setChecked(new Set(pending.linkedItems.map(itemKey)))
    setLink('')
    setLinkError(false)
    setDontAskAgain(false)
  }, [pending])

  const addLink = (): void => {
    const parsed =
      parseWorkspaceAttachmentInput(link, 'linear-issue') ??
      parseWorkspaceAttachmentInput(link, 'github-pr')
    if (!parsed) {
      setLinkError(link.trim().length > 0)
      return
    }
    const key = itemKey(parsed)
    setItems((prev) => (prev.some((i) => itemKey(i) === key) ? prev : [...prev, parsed]))
    setChecked((prev) => new Set(prev).add(key))
    setLink('')
    setLinkError(false)
  }

  const toggle = (key: string, on: boolean): void =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })

  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && settle({ mode: 'plain' })}>
      <DialogContent className="max-w-lg sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate('mte.start.title', 'Start this chat with MTE orchestration?')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'mte.start.description',
              'MTE is a planner → coder → validator loop. The planner interviews you about the goal, locks the requirements, writes task specs, dispatches coder agents and validates each result before merging. Orca writes the MTE tool config into this workspace first.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mte-start-goal">{translate('mte.start.goalLabel', 'Goal')}</Label>
            <Textarea
              id="mte-start-goal"
              rows={4}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={translate(
                'mte.start.goalPlaceholder',
                'What should this run deliver? Leave empty and the planner will ask.'
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>
              {translate('mte.start.linksLabel', 'Linked Linear issues and pull requests')}
            </Label>
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
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={dontAskAgain} onCheckedChange={(v) => setDontAskAgain(v === true)} />
            {translate('mte.start.dontAskAgain', "Don't ask again for this project")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle({ mode: 'plain' })}>
            {translate('mte.start.plainChat', 'Plain chat')}
          </Button>
          <Button
            onClick={() =>
              settle({
                mode: 'mte',
                goal,
                items: items.filter((i) => checked.has(itemKey(i))),
                dontAskAgain
              })
            }
          >
            {translate('mte.start.useMte', 'MTE orchestration')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
