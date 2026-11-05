import { describe, expect, it } from 'vitest'
import type { AgentSessionAttentionEdge } from './agent-session/agent-session-attention'
import type { AgentStatusOrchestrationContext, AgentStatusState } from './agent-status/contracts/agent-status-types'
import { isCoordinatorOnlyChatNews, isCoordinatorOnlyNews } from './dispatched-worker-attention'

const SCOPE = {
  executionHostId: 'local',
  wslDistro: null,
  workspaceId: 'repo-1::/work/feature',
  workspaceKind: 'git-worktree'
} as const

const PARENT: AgentStatusOrchestrationContext = {
  taskId: 'task_1',
  dispatchId: 'ctx_1',
  parentTerminalHandle: 'term_coordinator'
}

const prompt: AgentSessionAttentionEdge = {
  type: 'prompt',
  prompt: { scope: SCOPE, sessionId: 'session-1', promptId: 'approval-1', raisedAt: 1 }
}

const completion = (awaitingUser?: true): AgentSessionAttentionEdge => ({
  type: 'completion',
  completion: {
    scope: SCOPE,
    sessionId: 'session-1',
    turnId: 'turn-1',
    outcome: 'success',
    completedAt: 1,
    ...(awaitingUser ? { awaitingUser } : {})
  }
})

describe('dispatched worker attention', () => {
  it('claims every state of a worker with a coordinator — done, blocked, waiting, working', () => {
    const states: AgentStatusState[] = ['done', 'blocked', 'waiting', 'working']
    for (const state of states) {
      expect(isCoordinatorOnlyNews(state, () => PARENT)).toBe(true)
    }
  })

  it('claims a prompt edge and an awaiting-user completion as coordinator-only chat news', () => {
    expect(isCoordinatorOnlyChatNews(prompt, 'blocked', () => PARENT)).toBe(true)
    expect(isCoordinatorOnlyChatNews(completion(true), 'done', () => PARENT)).toBe(true)
    expect(isCoordinatorOnlyChatNews(completion(), 'done', () => PARENT)).toBe(true)
  })

  it('leaves an agent without a coordinator — the person’s own — to the usual policy', () => {
    expect(isCoordinatorOnlyNews('done', () => undefined)).toBe(false)
    expect(
      isCoordinatorOnlyNews('blocked', () => ({ ...PARENT, parentTerminalHandle: undefined }))
    ).toBe(false)
    expect(isCoordinatorOnlyChatNews(prompt, 'blocked', () => undefined)).toBe(false)
    expect(isCoordinatorOnlyChatNews(completion(true), 'done', () => undefined)).toBe(false)
  })
})
