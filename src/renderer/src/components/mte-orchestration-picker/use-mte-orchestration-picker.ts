import { useCallback, useRef, useState } from 'react'
import { isMteOrchestrationAgent } from '../../../../shared/mte/orchestration-agents'
import { newChatEntries, resolveNewChatPick } from '../tab-bar/new-chat-pick'
import type { NewChatChoice, NewChatSelection } from '../tab-bar/new-chat-dialog-store'
import type { AgentPickerEntry } from '../../../../shared/agent-launch/picker/agent-launch-picker'
import type { NewChatDefaults, NewChatPick } from '../../../../shared/new-chat-defaults'
import type { MteWorkerPin } from '../../../../shared/mte/worker-pin'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'

/** A workspace with nothing attached yet; entry points without linked items share this frozen list. */
export const NO_LINKED_ITEMS: readonly WorkspaceAttachment[] = []

/** Orchestration block state shared by every entry-point dialog (New Chat, worktree create, hand-off). */
export type MteOrchestrationDraft = {
  enabled: boolean
  setEnabled: (next: boolean) => void
  /** Chat-capable entries narrowed to harnesses MTE can orchestrate. */
  mteEntries: AgentPickerEntry[]
  orchestrator: NewChatSelection | null
  setOrchestrator: (pick: NewChatPick) => void
  worker: NewChatSelection | null
  setWorker: (pick: NewChatPick) => void
  goal: string
  setGoal: (goal: string) => void
  items: WorkspaceAttachment[]
  setItems: (items: WorkspaceAttachment[]) => void
  canStart: boolean
  /** Settled `mte` choice, or null while the toggle is off or a pick is not MTE-able. */
  buildChoice: () => Extract<NewChatChoice, { mode: 'mte' }> | null
}

/** Picker draft shape persisted as a repo default: the pick without its inventory entry. */
function stripSelection(selection: NewChatSelection): NewChatPick {
  return {
    agent: selection.agent,
    ...(selection.model ? { model: selection.model } : {}),
    ...(selection.effort ? { effort: selection.effort } : {})
  }
}

export function useMteOrchestrationPicker(input: {
  available: boolean
  entries: readonly AgentPickerEntry[]
  linkedItems: readonly WorkspaceAttachment[]
  defaults?: NewChatDefaults
  preferredAgent?: string
}): MteOrchestrationDraft {
  const { available, entries, defaults, preferredAgent } = input
  const [enabled, setEnabled] = useState(available && defaults?.orchestration === true)
  const [orchestrator, setOrchestrator] = useState<NewChatPick | undefined>(defaults?.orchestrator)
  const [worker, setWorker] = useState<NewChatPick | undefined>(defaults?.worker)
  const [goal, setGoal] = useState('')
  const [items, setItems] = useState<WorkspaceAttachment[]>([...input.linkedItems])
  const mteEntries = newChatEntries(entries, isMteOrchestrationAgent)
  const orchestratorSel = resolveNewChatPick(mteEntries, orchestrator, preferredAgent)
  const workerSel = resolveNewChatPick(mteEntries, worker, preferredAgent)
  const canStart = !!orchestratorSel && !!workerSel
  const stateRef = useRef({ enabled, orchestratorSel, workerSel, goal, items, defaults })
  stateRef.current = { enabled, orchestratorSel, workerSel, goal, items, defaults }
  const buildChoice = useCallback((): Extract<NewChatChoice, { mode: 'mte' }> | null => {
    const { enabled, orchestratorSel, workerSel, goal, items, defaults } = stateRef.current
    if (!enabled || !orchestratorSel || !workerSel || !isMteOrchestrationAgent(workerSel.agent)) {
      return null
    }
    const workerPin: MteWorkerPin = { ...stripSelection(workerSel), agent: workerSel.agent }
    return {
      mode: 'mte',
      orchestrator: orchestratorSel,
      worker: workerPin,
      goal,
      items,
      defaults: {
        ...defaults,
        orchestration: true,
        orchestrator: stripSelection(orchestratorSel),
        worker: workerPin
      }
    }
  }, [])
  return {
    enabled,
    setEnabled,
    mteEntries,
    orchestrator: orchestratorSel,
    setOrchestrator,
    worker: workerSel,
    setWorker,
    goal,
    setGoal,
    items,
    setItems,
    canStart,
    buildChoice
  }
}
