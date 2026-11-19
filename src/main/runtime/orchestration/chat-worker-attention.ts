import { chatWorkerTurnStopReporter } from './workers/turn-stops/chat-worker-turn-stops'
import { routeWorkerPromptToCoordinator } from './worker-prompt-routing'

/** One reporter per host: the stop reporter's generation map spans every turn edge, and a pending prompt also mails its question to the coordinator. */
export function chatWorkerTurnAttention(
  deps: Parameters<typeof chatWorkerTurnStopReporter>[0]
): ReturnType<typeof chatWorkerTurnStopReporter> {
  const reporter = chatWorkerTurnStopReporter(deps)
  return {
    ...reporter,
    onTurnAttention: (...args: Parameters<typeof reporter.onTurnAttention>) => {
      void routeWorkerPromptToCoordinator(deps, args[0])
      reporter.onTurnAttention(...args)
    }
  }
}
