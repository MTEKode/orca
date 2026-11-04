import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import {
  useAgentLaunchPickerInventorySource,
  useAgentPickerInventoryEntries
} from '@/components/agent/use-agent-launch-picker-inventory'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useNewTabAgentMenuRows } from '../tab-bar/use-new-tab-agent-menu-rows'
import { NewChatPickFields } from '../tab-bar/NewChatPickFields'
import { newChatEntries, resolveNewChatPick } from '../tab-bar/new-chat-pick'
import { composerSidePillLabel } from './native-chat-composer-agent-label-text'
import { isMteOrchestrationAgent } from '../../../../shared/mte/orchestration-agents'
import type { MteWorkerPin } from '../../../../shared/mte/worker-pin'

/** Harness + model + effort fields over the inventory; mounted only while the popover is open. */
function WorkerFields({
  worker,
  worktreeId,
  onChange
}: {
  worker: MteWorkerPin
  worktreeId: string
  onChange: (worker: MteWorkerPin) => void
}): React.JSX.Element {
  const target = useAgentDetectionTargetForWorktree(worktreeId)
  const model = useNewTabAgentMenuRows(worktreeId, true, target)
  const entries = newChatEntries(
    useAgentPickerInventoryEntries(useAgentLaunchPickerInventorySource(worktreeId, model, true)),
    isMteOrchestrationAgent
  )
  return (
    <NewChatPickFields
      id="composer-mte-worker"
      entries={entries}
      value={resolveNewChatPick(entries, worker)}
      onChange={(pick) => {
        if (isMteOrchestrationAgent(pick.agent)) {
          onChange({
            agent: pick.agent,
            ...(pick.model ? { model: pick.model } : {}),
            ...(pick.effort ? { effort: pick.effort } : {})
          })
        }
      }}
    />
  )
}

/** The composer's "Worker" selector on an MTE planner chat; a change only affects new dispatches. */
export function NativeChatMteWorkerPicker({
  worker,
  worktreeId,
  onChange
}: {
  worker: MteWorkerPin
  worktreeId: string | undefined
  onChange: (worker: MteWorkerPin) => void
}): React.JSX.Element {
  const title = translate('components.native-chat.composer.agentLabel.worker', 'Worker')
  const label = composerSidePillLabel('worker', worker)
  return (
    <div role="group" aria-label={title} className="flex min-w-0 items-center">
      <Popover>
        <PopoverTrigger asChild disabled={!worktreeId}>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={label}
            className="max-w-md text-chat-foreground-faint"
          >
            <span className="truncate text-chat-foreground">{label}</span>
            <ChevronDown className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" collisionPadding={8} className="w-80">
          {worktreeId ? (
            <WorkerFields worker={worker} worktreeId={worktreeId} onChange={onChange} />
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
