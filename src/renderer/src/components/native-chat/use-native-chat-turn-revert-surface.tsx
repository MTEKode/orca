import { useMemo } from 'react'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'
import type { NativeChatTurnRevertSurface } from './messages/rows/NativeChatTranscriptRow'
import { NativeChatTurnRevertDialog } from './NativeChatTurnRevertDialog'
import { useNativeChatTurnCheckpoints } from './use-native-chat-turn-checkpoints'
import { useNativeChatTurnRevert } from './use-native-chat-turn-revert'
import type { useStructuredAgentSession } from './session/structured/use-structured-agent-session'

type TurnRevertController = Pick<
  ReturnType<typeof useStructuredAgentSession>,
  'journalItems' | 'submissions' | 'latestTurn' | 'status' | 'revertTurn'
>

/** The turn bar's revert surface and its confirm dialog, composed for the session pane. */
export function useNativeChatTurnRevertSurface(
  pane: Pick<NativeChatStructuredViewProps, 'target' | 'sessionId'>,
  controller: TurnRevertController,
  worktreeId: string | null
): { surface: NativeChatTurnRevertSurface; dialog: React.JSX.Element | null } {
  const { target, sessionId } = pane
  const checkpoints = useNativeChatTurnCheckpoints({
    target,
    sessionId,
    journalItems: controller.journalItems,
    journalSubmissions: controller.submissions,
    latestTurn: controller.latestTurn,
    enabled: controller.status === 'ready'
  })
  const flow = useNativeChatTurnRevert({
    revertTurn: controller.revertTurn,
    worktreeId,
    refreshCheckpoints: checkpoints.refresh
  })
  const { hasStartCheckpoint, turnIdForTurnKey } = checkpoints
  const { request } = flow
  const surface = useMemo<NativeChatTurnRevertSurface>(
    () => ({
      hasStartCheckpoint,
      requestRevert: (turnKey) => {
        const turnId = turnIdForTurnKey(turnKey)
        if (turnId !== undefined) {
          request(turnId)
        }
      }
    }),
    [hasStartCheckpoint, request, turnIdForTurnKey]
  )
  const dialog =
    flow.turnId !== null ? (
      <NativeChatTurnRevertDialog
        target={target}
        sessionId={sessionId}
        turnId={flow.turnId}
        kind="start"
        busy={flow.busy}
        onCancel={flow.cancel}
        onConfirm={() => void flow.confirm()}
      />
    ) : null
  return { surface, dialog }
}
