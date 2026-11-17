import { describe, expect, it } from 'vitest'
import type {
  AgentStatusEntry,
  AgentStatusOrchestrationContext
} from '../../../../../shared/agent-status/contracts/agent-status-types'
import { deriveActiveFlowState } from './flow-dashboard-selector'

const status = (paneKey: string, extra: Partial<AgentStatusEntry> = {}): AgentStatusEntry => ({
  state: 'working',
  prompt: '',
  updatedAt: 2_000,
  stateStartedAt: 1_000,
  paneKey,
  stateHistory: [],
  ...extra
})

const context = (
  dispatchId: string,
  extra: Partial<AgentStatusOrchestrationContext> = {}
): AgentStatusOrchestrationContext => ({
  taskId: `task_${dispatchId}`,
  dispatchId,
  orchestrationRunId: 'run_1',
  ...extra
})

describe('deriveActiveFlowState', () => {
  it('reports the worker agent, not the planner handle, and fails on a failed dispatch', () => {
    const flow = deriveActiveFlowState(
      { planner: status('planner'), worker: status('worker', { agentType: 'codex' }) },
      {
        planner: context('d0', { taskTitle: 'Ship it' }),
        worker: context('d1', {
          parentPaneKey: 'planner',
          coordinatorHandle: 'term_planner',
          dispatchStatus: 'failed'
        })
      }
    )
    expect(flow).toMatchObject({ id: 'run_1', goal: 'Ship it', status: 'failed', startedAt: 1_000 })
    expect(flow?.workers).toMatchObject([
      { id: 'd1', taskId: 'task_d1', agent: 'codex', coordinatorHandle: 'term_planner' }
    ])
  })

  it('returns null when no pane of the run has a live status row', () => {
    expect(deriveActiveFlowState({}, { planner: context('d0') })).toBeNull()
  })
})
