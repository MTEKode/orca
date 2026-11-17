import type { AppState } from '@/store/types'
import { selectVisibleAgentOrchestration } from '@/runtime/agent-orchestration/visible-agent-orchestration'
import type { AgentStatusOrchestrationContext } from '../../../../../shared/agent-status/contracts/agent-status-types'

export type FlowWorkerStatus = {
  id: string
  paneKey: string
  name: string
  agent: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  worktreeId?: string
  startedAt?: number
  completedAt?: number
  error?: string
  parentPaneKey?: string
}

export type FlowStatus = 'planning' | 'executing' | 'validating' | 'completed' | 'failed' | 'idle'

export type FlowState = {
  id: string
  goal: string
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
  agentStatus: ReturnType<typeof selectAgentStatusByPaneKey>[string] | undefined
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

  const agentState = agentStatus?.state
  if (agentState === 'error' || agentState === 'exited') {
    flowStatus = 'failed'
  }

  return {
    id: context.dispatchId,
    paneKey,
    name: context.displayName ?? context.taskTitle ?? 'Worker',
    agent: context.coordinatorHandle ?? 'unknown',
    status: flowStatus,
    worktreeId: agentStatus?.worktreeId,
    startedAt: agentStatus?.stateStartedAt,
    completedAt: flowStatus === 'completed' || flowStatus === 'failed' 
      ? agentStatus?.updatedAt 
      : undefined,
    error: flowStatus === 'failed' ? 'Worker failed' : undefined,
    parentPaneKey: context.parentPaneKey
  }
}

function deriveFlowStatus(workers: FlowWorkerStatus[], hasPlanner: boolean): FlowStatus {
  if (workers.length === 0 && !hasPlanner) {
    return 'idle'
  }

  const allCompleted = workers.length > 0 && workers.every(w => w.status === 'completed')
  const anyFailed = workers.some(w => w.status === 'failed')

  if (anyFailed) {
    return 'failed'
  }

  if (allCompleted) {
    return 'completed'
  }

  if (!hasPlanner) {
    return 'planning'
  }

  const hasRunningWorkers = workers.some(w => w.status === 'running')
  if (hasRunningWorkers) {
    return 'executing'
  }

  return 'validating'
}

export function selectActiveFlowState(state: AppState): FlowState | null {
  const agentStatusByPaneKey = state.agentStatusByPaneKey
  const orchestrationContexts = selectVisibleAgentOrchestration(state)
  
  const flowsByRunId = new Map<string, {
    contexts: { paneKey: string; context: AgentStatusOrchestrationContext }[]
    earliestStart: number
  }>()

  for (const [paneKey, context] of Object.entries(orchestrationContexts)) {
    if (!context.orchestrationRunId) {
      continue
    }

    const runId = context.orchestrationRunId
    if (!flowsByRunId.has(runId)) {
      flowsByRunId.set(runId, {
        contexts: [],
        earliestStart: Date.now()
      })
    }

    const flow = flowsByRunId.get(runId)!
    flow.contexts.push({ paneKey, context })

    const agentStatus = agentStatusByPaneKey[paneKey]
    if (agentStatus?.stateStartedAt && agentStatus.stateStartedAt < flow.earliestStart) {
      flow.earliestStart = agentStatus.stateStartedAt
    }
  }

  if (flowsByRunId.size === 0) {
    return null
  }

  const activeFlows = Array.from(flowsByRunId.entries())
    .map(([runId, flow]) => ({ runId, ...flow }))
    .filter(flow => {
      const hasActiveWorkers = flow.contexts.some(({ paneKey }) => {
        const status = agentStatusByPaneKey[paneKey]
        return status && status.state !== 'exited'
      })
      return hasActiveWorkers
    })
    .sort((a, b) => b.earliestStart - a.earliestStart)

  if (activeFlows.length === 0) {
    return null
  }

  const activeFlow = activeFlows[0]
  const workers: FlowWorkerStatus[] = []
  let plannerPaneKey: string | undefined
  let goal = 'Orchestration task'

  for (const { paneKey, context } of activeFlow.contexts) {
    const agentStatus = agentStatusByPaneKey[paneKey]
    
    if (!context.parentPaneKey) {
      plannerPaneKey = paneKey
      goal = context.taskTitle ?? goal
    } else {
      workers.push(deriveWorkerStatus(context, paneKey, agentStatus))
    }
  }

  const status = deriveFlowStatus(workers, plannerPaneKey !== undefined)
  const completedWorkerCount = workers.filter(w => w.status === 'completed').length
  const failedWorkerCount = workers.filter(w => w.status === 'failed').length

  const allDone = status === 'completed' || status === 'failed'
  const completedAt = allDone
    ? Math.max(...workers.map(w => w.completedAt ?? 0), 0) || undefined
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
