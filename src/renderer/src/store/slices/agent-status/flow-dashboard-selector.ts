import type { AppState } from '@/store/types'
import { selectVisibleAgentOrchestration } from '@/runtime/agent-orchestration/visible-agent-orchestration'
import type {
  AgentStatusEntry,
  AgentStatusOrchestrationContext
} from '../../../../../shared/agent-status/contracts/agent-status-types'

export type FlowWorkerStatus = {
  id: string
  taskId: string
  paneKey: string
  /** Undefined when the dispatch carries no name; the view supplies a translated fallback. */
  name?: string
  /** The worker's own agent type, not the planner that dispatched it. */
  agent?: string
  /** Planner terminal handle; a retry is dispatched on its behalf. */
  coordinatorHandle?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  worktreeId?: string
  startedAt?: number
  completedAt?: number
  parentPaneKey?: string
}

export type FlowStatus = 'planning' | 'executing' | 'validating' | 'completed' | 'failed' | 'idle'

export type FlowState = {
  id: string
  goal?: string
  status: FlowStatus
  plannerPaneKey?: string
  workers: FlowWorkerStatus[]
  startedAt: number
  completedAt?: number
  workerCount: number
  completedWorkerCount: number
  failedWorkerCount: number
}

function deriveWorkerStatus(
  context: AgentStatusOrchestrationContext,
  paneKey: string,
  agentStatus: AgentStatusEntry | undefined
): FlowWorkerStatus {
  const status = context.dispatchStatus ?? 'pending'

  let flowStatus: FlowWorkerStatus['status']
  if (status === 'pending') {
    flowStatus = 'pending'
  } else if (status === 'dispatched') {
    flowStatus = 'running'
  } else if (status === 'completed') {
    flowStatus = 'completed'
  } else if (status === 'failed' || status === 'circuit_broken') {
    flowStatus = 'failed'
  } else {
    flowStatus = 'pending'
  }

  return {
    id: context.dispatchId,
    taskId: context.taskId,
    paneKey,
    name: context.displayName ?? context.taskTitle,
    agent: agentStatus?.agentType,
    coordinatorHandle: context.coordinatorHandle,
    status: flowStatus,
    worktreeId: agentStatus?.worktreeId,
    startedAt: agentStatus?.firstStateStartedAt ?? agentStatus?.stateStartedAt,
    completedAt:
      flowStatus === 'completed' || flowStatus === 'failed' ? agentStatus?.updatedAt : undefined,
    parentPaneKey: context.parentPaneKey
  }
}

function deriveFlowStatus(workers: FlowWorkerStatus[], hasPlanner: boolean): FlowStatus {
  if (workers.length === 0 && !hasPlanner) {
    return 'idle'
  }

  const allCompleted = workers.length > 0 && workers.every((w) => w.status === 'completed')
  const anyFailed = workers.some((w) => w.status === 'failed')

  if (anyFailed) {
    return 'failed'
  }

  if (allCompleted) {
    return 'completed'
  }

  if (!hasPlanner) {
    return 'planning'
  }

  const hasRunningWorkers = workers.some((w) => w.status === 'running')
  if (hasRunningWorkers) {
    return 'executing'
  }

  return 'validating'
}

let cache: { statuses: unknown; contexts: unknown; flow: FlowState | null } | undefined

// Zustand compares snapshots by identity, so the derived object must be stable for unchanged inputs.
export function selectActiveFlowState(state: AppState): FlowState | null {
  const statuses = state.agentStatusByPaneKey
  const contexts = selectVisibleAgentOrchestration(state)
  if (cache?.statuses !== statuses || cache.contexts !== contexts) {
    cache = { statuses, contexts, flow: deriveActiveFlowState(statuses, contexts) }
  }
  return cache.flow
}

export function deriveActiveFlowState(
  agentStatusByPaneKey: Pick<ReadonlyMap<string, AgentStatusEntry>, 'get'>,
  orchestrationContexts: Record<string, AgentStatusOrchestrationContext>
): FlowState | null {
  const flowsByRunId = new Map<
    string,
    {
      contexts: { paneKey: string; context: AgentStatusOrchestrationContext }[]
      earliestStart: number
    }
  >()

  for (const [paneKey, context] of Object.entries(orchestrationContexts)) {
    if (!context.orchestrationRunId) {
      continue
    }

    const runId = context.orchestrationRunId
    if (!flowsByRunId.has(runId)) {
      flowsByRunId.set(runId, {
        contexts: [],
        earliestStart: Infinity
      })
    }

    const flow = flowsByRunId.get(runId)!
    flow.contexts.push({ paneKey, context })

    const agentStatus = agentStatusByPaneKey.get(paneKey)
    const startedAt = agentStatus?.firstStateStartedAt ?? agentStatus?.stateStartedAt
    if (startedAt && startedAt < flow.earliestStart) {
      flow.earliestStart = startedAt
    }
  }

  if (flowsByRunId.size === 0) {
    return null
  }

  const activeFlows = Array.from(flowsByRunId.entries())
    .map(([runId, flow]) => ({ runId, ...flow }))
    // Exited agents lose their status row, so a live row is what makes a flow active.
    .filter((flow) => flow.contexts.some(({ paneKey }) => agentStatusByPaneKey.get(paneKey)))
    .sort((a, b) => b.earliestStart - a.earliestStart)

  if (activeFlows.length === 0) {
    return null
  }

  const activeFlow = activeFlows[0]
  const workers: FlowWorkerStatus[] = []
  let plannerPaneKey: string | undefined
  let goal: string | undefined

  for (const { paneKey, context } of activeFlow.contexts) {
    const agentStatus = agentStatusByPaneKey.get(paneKey)

    if (!context.parentPaneKey) {
      plannerPaneKey = paneKey
      goal = context.taskTitle
    } else {
      workers.push(deriveWorkerStatus(context, paneKey, agentStatus))
    }
  }

  const status = deriveFlowStatus(workers, plannerPaneKey !== undefined)
  const completedWorkerCount = workers.filter((w) => w.status === 'completed').length
  const failedWorkerCount = workers.filter((w) => w.status === 'failed').length

  const allDone = status === 'completed' || status === 'failed'
  const completedAt = allDone
    ? Math.max(...workers.map((w) => w.completedAt ?? 0), 0) || undefined
    : undefined

  return {
    id: activeFlow.runId,
    goal,
    status,
    plannerPaneKey,
    workers,
    startedAt: activeFlow.earliestStart,
    completedAt,
    workerCount: workers.length,
    completedWorkerCount,
    failedWorkerCount
  }
}
