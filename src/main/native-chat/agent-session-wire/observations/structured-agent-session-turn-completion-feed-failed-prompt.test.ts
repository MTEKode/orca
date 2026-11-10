import { describe, expect, it } from 'vitest'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission,
  AgentJournalTurnLifecycle
} from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { agentJournalSubmissionKey } from '../../../../shared/agent-session/journal/agent-session-journal-item-key'
import type { AgentSessionTurnCompletionEvent } from '../../../../shared/agent-session/view/agent-session-turn-completion-wire'
import { projectStructuredAgentSessionStatusState } from '../../../../shared/agent-session/view/structured-agent-session-projection'
import { StructuredAgentSessionTurnCompletionFeed } from './structured-agent-session-turn-completion-feed'

// Fork coverage: a failed turn that leaves a prompt pending must still raise it to the coordinator.
const LOCATION = {
  executionHostId: 'local',
  wslDistro: null,
  workspaceId: 'workspace-1',
  workspaceKind: 'git-worktree'
} as const

function turn(
  turnId: string,
  state: AgentJournalTurnLifecycle['state'],
  outcome?: AgentJournalTurnLifecycle['outcome']
): AgentJournalTurnLifecycle {
  return { turnId, state, ...(outcome ? { outcome } : {}) }
}

function turnItem(lifecycle: AgentJournalTurnLifecycle, sequence: number): AgentJournalRenderItem {
  return {
    itemId: `codex:turn:${lifecycle.turnId}`,
    revision: 1,
    sequence,
    observedAt: sequence,
    body: { kind: 'turn', ...lifecycle }
  }
}

function userEntry(clientMessageId: string, sequence: number): AgentJournalRenderItem {
  return {
    itemId: agentJournalSubmissionKey(clientMessageId),
    revision: 0,
    sequence,
    observedAt: sequence,
    body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: clientMessageId }] }
  }
}

function sent(
  clientMessageId: string,
  fields: Partial<AgentJournalSubmission> & Pick<AgentJournalSubmission, 'dispatchState'>
): AgentJournalSubmission {
  return {
    clientMessageId,
    fence: 1,
    payloadFingerprint: clientMessageId,
    providerItemId: null,
    reason: null,
    submittedAt: 10,
    resolvedAt: 20,
    handoverRecorded: true,
    ...fields
  }
}

function harness(): {
  feed: StructuredAgentSessionTurnCompletionFeed
  setTurn: (next: AgentJournalTurnLifecycle | null) => void
  setJournal: (
    items: AgentJournalRenderItem[],
    submissions: AgentJournalSubmission[],
    fence?: number
  ) => void
  setCursor: (next: { epoch: string; sequence: number }) => void
  observe: () => void
  events: AgentSessionTurnCompletionEvent[]
  outcomes: () => [string, string][]
  awaitingUser: () => boolean[]
  prompts: () => string[]
  listen: (options?: { includePrompts?: boolean }) => () => void
} {
  let items: AgentJournalRenderItem[] = []
  let submissions: AgentJournalSubmission[] = []
  let fence: number | undefined
  let cursor = { epoch: 'epoch-1', sequence: 0 }
  const journal = { cursor: () => cursor }
  const sessions = new Map([['session-1', { journal, params: { location: LOCATION } }]])
  const feed = new StructuredAgentSessionTurnCompletionFeed({
    sessions,
    now: () => 1_700,
    readStatusState: () => projectStructuredAgentSessionStatusState(items, submissions, fence),
    readChildWork: () => []
  })
  const events: AgentSessionTurnCompletionEvent[] = []
  return {
    feed,
    setTurn: (next) => {
      items = next ? [turnItem(next, 1)] : []
      submissions = []
    },
    setJournal: (nextItems, nextSubmissions, nextFence) => {
      items = nextItems
      submissions = nextSubmissions
      fence = nextFence
      cursor = { ...cursor, sequence: cursor.sequence + 1 }
    },
    setCursor: (next) => {
      cursor = next
    },
    observe: () => feed.observe('session-1'),
    events,
    outcomes: () =>
      events.flatMap((event): [string, string][] =>
        event.type === 'completion' ? [[event.completion.turnId, event.completion.outcome]] : []
      ),
    awaitingUser: () =>
      events.flatMap((event) =>
        event.type === 'completion' ? [event.completion.awaitingUser === true] : []
      ),
    prompts: () =>
      events.flatMap((event) => (event.type === 'prompt' ? [event.prompt.promptId] : [])),
    listen: (options) =>
      feed.subscribe({
        id: 'sub',
        emit: (event) => events.push(event),
        ...(options?.includePrompts ? { includePrompts: true } : {})
      })
  }
}

describe('a failed turn that leaves a prompt pending', () => {
  function approval(
    itemId: string,
    sequence: number,
    state: 'pending' | 'resolved',
    agentId?: string
  ): AgentJournalRenderItem {
    return {
      itemId,
      revision: state === 'pending' ? 1 : 2,
      sequence,
      observedAt: sequence,
      ...(agentId ? { agentId } : {}),
      body: {
        kind: 'approval',
        title: 'Run command?',
        detail: null,
        options: [{ id: 'yes', label: 'Allow' }],
        resolution: { state, selectedOptionId: null, resolvedBy: null, resolvedAt: null }
      }
    }
  }

  it('still raises a prompt left pending by a failed turn, after the failure completion', () => {
    const h = harness()
    h.listen({ includePrompts: true })
    const user = userEntry('m1', 1)
    const accepted = [sent('m1', { dispatchState: 'accepted' })]
    h.setJournal([user, turnItem(turn('t1', 'running'), 2)], accepted)
    h.observe()
    h.setJournal(
      [user, turnItem(turn('t1', 'completed', 'failure'), 2), approval('a1', 3, 'pending')],
      accepted
    )
    h.observe()
    expect(h.outcomes()).toEqual([['t1', 'failure']])
    expect(h.prompts()).toEqual(['a1'])
  })
})
