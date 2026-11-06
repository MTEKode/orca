import React from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { NewChatGoalFields } from '../tab-bar/NewChatGoalFields'
import { NewChatPickFields } from '../tab-bar/NewChatPickFields'
import type { MteOrchestrationDraft } from './use-mte-orchestration-picker'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'
import type { AgentPickerEntry } from '../../../../shared/agent-launch/picker/agent-launch-picker'

/**
 * The MTE orchestration block every entry-point dialog reuses: the mode toggle and,
 * when on, the orchestrator/worker/effort pickers plus the goal textarea.
 */
export function MteOrchestrationPicker({
  draft,
  linkedItems,
  onSelectAgent
}: {
  draft: MteOrchestrationDraft
  linkedItems: readonly WorkspaceAttachment[]
  onSelectAgent?: (agent: AgentPickerEntry['agent']) => void
}): React.JSX.Element {
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={draft.enabled} onCheckedChange={(v) => draft.setEnabled(v === true)} />
        {translate('newChat.orchestration', 'Orchestration mode')}
      </label>
      {draft.enabled ? (
        <div className="flex flex-col gap-3">
          <NewChatPickFields
            id="new-chat-orchestrator"
            title={translate('newChat.orchestrator', 'Orchestrator')}
            entries={draft.mteEntries}
            value={draft.orchestrator}
            onChange={draft.setOrchestrator}
            onSelectAgent={onSelectAgent}
          />
          <NewChatPickFields
            id="new-chat-worker"
            title={translate('newChat.worker', 'Worker')}
            entries={draft.mteEntries}
            value={draft.worker}
            onChange={draft.setWorker}
            onSelectAgent={onSelectAgent}
          />
          <NewChatGoalFields
            goal={draft.goal}
            onGoalChange={draft.setGoal}
            initialItems={linkedItems}
            onItemsChange={draft.setItems}
          />
        </div>
      ) : null}
    </>
  )
}
