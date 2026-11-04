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
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import {
  useAgentLaunchPickerInventorySource,
  useAgentPickerInventoryEntries
} from '@/components/agent/use-agent-launch-picker-inventory'
import { useNewTabAgentMenuRows } from './use-new-tab-agent-menu-rows'
import { isMteOrchestrationAgent } from '../../../../shared/mte/orchestration-agents'
import type { AgentPickerEntry } from '../../../../shared/agent-launch-picker'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'
import type { NewChatPick } from '../../../../shared/new-chat-defaults'
import { useNewChatDialogStore, type NewChatRequest } from './new-chat-dialog-store'
import { newChatEntries, resolveNewChatPick } from './new-chat-pick'
import { NewChatPickFields } from './NewChatPickFields'
import { NewChatGoalFields } from './NewChatGoalFields'

/** True while the model list is still the static seed, so the user knows it may be incomplete. */
export function newChatCatalogIsFallback(entries: readonly AgentPickerEntry[]): boolean {
  return entries.some((e) => e.catalog.origin === 'unknown' || e.structuredDefaultsPending)
}

export function NewChatDialogForm({
  request,
  entries,
  preferredAgent,
  onSettle
}: {
  request: NewChatRequest
  entries: readonly AgentPickerEntry[]
  preferredAgent?: string
  onSettle: ReturnType<typeof useNewChatDialogStore.getState>['settle']
}): React.JSX.Element {
  const { defaults } = request
  const [orchestration, setOrchestration] = useState(
    request.orchestrationAvailable && defaults?.orchestration === true
  )
  const [chat, setChat] = useState<NewChatPick | undefined>(request.initial ?? defaults?.chat)
  const [orch, setOrch] = useState<NewChatPick | undefined>(defaults?.orchestrator)
  const [worker, setWorker] = useState<NewChatPick | undefined>(defaults?.worker)
  const [goal, setGoal] = useState('')
  const [items, setItems] = useState<WorkspaceAttachment[]>([...request.linkedItems])

  const chatEntries = newChatEntries(entries)
  const mteEntries = newChatEntries(entries, isMteOrchestrationAgent)
  const chatSel = resolveNewChatPick(chatEntries, chat, preferredAgent)
  const orchSel = resolveNewChatPick(mteEntries, orch, preferredAgent)
  const workerSel = resolveNewChatPick(mteEntries, worker, preferredAgent)
  const strip = (s: NonNullable<typeof chatSel>): NewChatPick => ({
    agent: s.agent,
    ...(s.model ? { model: s.model } : {}),
    ...(s.effort ? { effort: s.effort } : {})
  })

  const start = (): void => {
    if (orchestration && orchSel && workerSel && isMteOrchestrationAgent(workerSel.agent)) {
      const worker = { ...strip(workerSel), agent: workerSel.agent }
      onSettle({
        mode: 'mte',
        orchestrator: orchSel,
        worker,
        goal,
        items,
        defaults: { ...defaults, orchestration: true, orchestrator: strip(orchSel), worker }
      })
    } else if (!orchestration && chatSel) {
      onSettle({
        mode: 'chat',
        chat: chatSel,
        defaults: { ...defaults, orchestration: false, chat: strip(chatSel) }
      })
    }
  }
  const canStart = orchestration ? !!orchSel && !!workerSel : !!chatSel

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
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={orchestration}
              onCheckedChange={(v) => setOrchestration(v === true)}
            />
            {translate('newChat.orchestration', 'Orchestration mode')}
          </label>
        ) : null}
        {orchestration ? (
          <>
            <NewChatPickFields
              id="new-chat-orchestrator"
              title={translate('newChat.orchestrator', 'Orchestrator')}
              entries={mteEntries}
              value={orchSel}
              onChange={setOrch}
            />
            <NewChatPickFields
              id="new-chat-worker"
              title={translate('newChat.worker', 'Worker')}
              entries={mteEntries}
              value={workerSel}
              onChange={setWorker}
            />
            <NewChatGoalFields
              goal={goal}
              onGoalChange={setGoal}
              initialItems={request.linkedItems}
              onItemsChange={setItems}
            />
          </>
        ) : (
          <NewChatPickFields
            id="new-chat"
            entries={chatEntries}
            value={chatSel}
            onChange={setChat}
          />
        )}
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
  const detectionTarget = useAgentDetectionTargetForWorktree(request.worktreeId)
  const model = useNewTabAgentMenuRows(request.worktreeId, true, detectionTarget)
  const source = useAgentLaunchPickerInventorySource(request.worktreeId, model, true)
  const entries = useAgentPickerInventoryEntries(source)
  const preferred = model.state === 'settled' ? model.defaultTuiAgent : undefined
  return (
    <NewChatDialogForm
      request={request}
      entries={entries}
      preferredAgent={preferred && preferred !== 'blank' ? preferred : undefined}
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
