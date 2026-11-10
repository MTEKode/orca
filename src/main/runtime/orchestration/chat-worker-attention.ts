import type { AgentSessionStatusSummary } from '../../../shared/agent-session/agent-session-wire'
import type { AgentSessionTurnCompletionEvent } from '../../../shared/agent-session/view/agent-session-turn-completion-wire'
import { chatWorkerTurnStopReporter } from './workers/turn-stops/chat-worker-turn-stops'
import { routeWorkerPromptToCoordinator } from './worker-prompt-routing'
import type { WorkerTurnStopReportDeps } from './workers/turn-stops/worker-turn-stop-report'

/** One handler per host: the stop reporter's generation map spans every turn edge, and a pending prompt also mails its question to the coordinator. */
export function chatWorkerTurnAttention(
  deps: WorkerTurnStopReportDeps
): (
  event: AgentSessionTurnCompletionEvent,
  readStatus: (
    sessionId: string
  ) => Pick<AgentSessionStatusSummary, 'status' | 'lastAssistantMessage'> | undefined
) => void {
  const turnAttention = chatWorkerTurnStopReporter(deps)
  return (event, readStatus) => {
    void routeWorkerPromptToCoordinator(deps, event)
    turnAttention(event, readStatus)
  }
}
