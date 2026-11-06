import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import {
  useAgentLaunchPickerInventorySource,
  useAgentPickerInventoryEntries
} from '@/components/agent/use-agent-launch-picker-inventory'
import { useNewTabAgentMenuRows } from './use-new-tab-agent-menu-rows'
import { MteOrchestrationPicker } from '@/components/mte-orchestration-picker/MteOrchestrationPicker'
import { useMteOrchestrationPicker } from '@/components/mte-orchestration-picker/use-mte-orchestration-picker'
import type { AgentPickerEntry } from '../../../../shared/agent-launch/picker/agent-launch-picker'
import type { NewChatPick } from '../../../../shared/new-chat-defaults'
import { useNewChatDialogStore, type NewChatRequest } from './new-chat-dialog-store'
import { newChatEntries, resolveNewChatPick } from './new-chat-pick'
import { NewChatPickFields } from './NewChatPickFields'

/** True while the model list is still the static seed, so the user knows it may be incomplete. */
export function newChatCatalogIsFallback(entries: readonly AgentPickerEntry[]): boolean {
  return entries.some((e) => e.catalog.origin === 'unknown' || e.structuredDefaultsPending)
}

export function NewChatDialogForm({
  request,
  entries,
  preferredAgent,
  onSelectAgent,
  onSettle
}: {
  request: NewChatRequest
  entries: readonly AgentPickerEntry[]
  preferredAgent?: string
  onSelectAgent?: (agent: AgentPickerEntry['agent']) => void
  onSettle: ReturnType<typeof useNewChatDialogStore.getState>['settle']
}): React.JSX.Element {
  const { defaults } = request
  const draft = useMteOrchestrationPicker({
    available: request.orchestrationAvailable,
    entries,
    linkedItems: request.linkedItems,
    ...(defaults ? { defaults } : {}),
    ...(preferredAgent ? { preferredAgent } : {})
  })
  const [chat, setChat] = useState<NewChatPick | undefined>(request.initial ?? defaults?.chat)

  const chatEntries = newChatEntries(entries)
  const chatSel = resolveNewChatPick(chatEntries, chat, preferredAgent)
  const strip = (s: NonNullable<typeof chatSel>): NewChatPick => ({
    agent: s.agent,
    ...(s.model ? { model: s.model } : {}),
    ...(s.effort ? { effort: s.effort } : {})
  })

  const start = (): void => {
    if (draft.enabled) {
      const choice = draft.buildChoice()
      if (choice) {
        onSettle(choice)
      }
    } else if (chatSel) {
      onSettle({
        mode: 'chat',
        chat: chatSel,
        defaults: { ...defaults, orchestration: false, chat: strip(chatSel) }
      })
    }
  }
  const canStart = draft.enabled ? draft.canStart : !!chatSel

  return (
    <DialogContent className="max-w-lg sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{translate('newChat.title', 'New chat')}</DialogTitle>
        <DialogDescription>
          {translate(
            'newChat.description',
            'Pick the harness, model and effort. Orchestration mode runs a planner that dispatches workers on the model you pin.'
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        {request.orchestrationAvailable ? (
          <MteOrchestrationPicker
            draft={draft}
            linkedItems={request.linkedItems}
            onSelectAgent={onSelectAgent}
          />
        ) : null}
        {!draft.enabled ? (
          <NewChatPickFields
            id="new-chat"
            entries={chatEntries}
            value={chatSel}
            onChange={setChat}
            onSelectAgent={onSelectAgent}
          />
        ) : null}
        {newChatCatalogIsFallback(entries) ? (
          <p className="text-xs text-muted-foreground">
            {translate('newChat.catalogFallback', 'Model list may be incomplete')}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onSettle(null)}>
          {translate('newChat.cancel', 'Cancel')}
        </Button>
        <Button disabled={!canStart} onClick={start}>
          {translate('newChat.start', 'Start')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function NewChatDialogLive({ request }: { request: NewChatRequest }): React.JSX.Element {
  const settle = useNewChatDialogStore((s) => s.settle)
  const [selectedAgent, setSelectedAgent] = useState<AgentPickerEntry['agent'] | undefined>()
  const detectionTarget = useAgentDetectionTargetForWorktree(request.worktreeId)
  const model = useNewTabAgentMenuRows(request.worktreeId, true, detectionTarget)
  const source = useAgentLaunchPickerInventorySource(request.worktreeId, model, true, selectedAgent)
  const entries = useAgentPickerInventoryEntries(source)
  const preferred = model.state === 'settled' ? model.defaultTuiAgent : undefined
  return (
    <NewChatDialogForm
      request={request}
      entries={entries}
      preferredAgent={preferred && preferred !== 'blank' ? preferred : undefined}
      onSelectAgent={setSelectedAgent}
      onSettle={settle}
    />
  )
}

/** New Chat modal: harness/model/effort, or orchestration mode with pinned orchestrator and worker. */
export const NewChatDialog = React.memo(function NewChatDialog() {
  useUiLanguageRevision()
  const pending = useNewChatDialogStore((s) => s.pending)
  const settle = useNewChatDialogStore((s) => s.settle)
  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && settle(null)}>
      {pending ? <NewChatDialogLive key={pending.worktreeId} request={pending} /> : null}
    </Dialog>
  )
})
