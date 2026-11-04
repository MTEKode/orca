import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionTurnCompletionEvent } from '../../../shared/agent-session/view/agent-session-turn-completion-wire'
import { computeAgentSessionPayloadFingerprint } from '../../../shared/agent-session/lifecycle/agent-session-mutation-envelope'
import type { AgentJournalRenderItem } from '../../../shared/agent-session/journal/agent-session-journal-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { formatOrcaSessionAddress } from '../../../shared/orca-session-address'
import { testOrcaSessionId } from '../../../shared/orca-session-address-test-fixture'
import { chatWorkerTurnStopReporter } from './chat-worker-turn-stops'
import { OrchestrationDb } from './db'
import { createRootDispatch } from './db/root-dispatch-test-fixture'
import { routeWorkerPromptToCoordinator, resolveWorkerPromptReply } from './worker-prompt-routing'

const CHAT_SESSION = testOrcaSessionId('9a4e7c1b-3d2f-4b6a-8e5c-7f1d0b2a6c93')
const FROM = formatOrcaSessionAddress(CHAT_SESSION)

const state = vi.hoisted(() => ({
  host: null as {
    journalSnapshot: (sessionId: string) => Promise<{ items: unknown[] }>
    deps: {
      store: { getRecord: (sessionId: string) => { lease: { runtimeFence: number } } | undefined }
    }
    respondToPrompt: (...args: unknown[]) => Promise<unknown>
  } | null
}))

vi.mock('../../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => state.host
}))

const respondToPrompt = vi.fn()
let items: AgentJournalRenderItem[] = []

function journalItem(body: AgentJournalRenderItem['body']): AgentJournalRenderItem {
  return {
    itemId: 'item-1',
    revision: 2,
    sequence: 1,
    observedAt: 1,
    body
  }
}

const pending = {
  state: 'pending' as const,
  selectedOptionId: null,
  resolvedBy: null,
  resolvedAt: null
}

function approval(resolution = pending): AgentJournalRenderItem['body'] {
  return {
    kind: 'approval',
    title: 'Run rm -rf build',
    detail: null,
    options: [
      { id: 'allow', label: 'Allow' },
      { id: 'allowForSession', label: 'Allow for session' },
      { id: 'reject', label: 'Reject' }
    ],
    resolution
  }
}

function question(
  body: Partial<AgentJournalRenderItem['body']> = {},
  resolution = pending
): AgentJournalRenderItem['body'] {
  return {
    kind: 'question',
    question: 'Which database?',
    options: [
      { id: 'opt-sqlite', label: 'SQLite' },
      { id: 'opt-postgres', label: 'Postgres' }
    ],
    resolution,
    ...body
  }
}

const promptEvent = (): AgentSessionTurnCompletionEvent => ({
  type: 'prompt',
  prompt: {
    scope: {
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      wslDistro: null,
      workspaceId: 'repo::/tmp/wt',
      workspaceKind: 'git-worktree'
    },
    sessionId: CHAT_SESSION,
    promptId: 'item-1',
    raisedAt: 1
  }
})

function setup() {
  const db = new OrchestrationDb(':memory:')
  const run = db.createRun({
    objective: 'prompts',
    coordinatorHandle: 'term_coordinator',
    coordinatorPaneKey: makePaneKey('tab-coordinator', '22222222-2222-4222-8222-222222222222')
  })
  const task = db.createTask({ spec: 'do the work', runId: run.id })
  const dispatch = createRootDispatch(db, task.id, FROM)
  const notify = vi.fn()
  const deps = { getDb: () => db, isWaitingForMail: () => false, notify }
  const mail = (types: string[] = ['question']) => db.getUnreadRunMailbox(run.id, 100, types)
  return { db, run, dispatch, notify, deps, mail }
}

const okResult = {
  ok: true as const,
  replayed: false,
  fence: 1,
  cursor: { sequence: 2, emittedAt: 1 },
  value: { itemId: 'item-1', revision: 3, resolution: { state: 'resolved' } }
}

beforeEach(() => {
  items = []
  respondToPrompt.mockReset()
  respondToPrompt.mockResolvedValue(okResult)
  state.host = {
    journalSnapshot: async () => ({ items }),
    deps: {
      store: {
        getRecord: () => ({ lease: { runtimeFence: 3 } }),
        getConversation: () => undefined,
        listConversations: () => [],
        getVisibleSessionTabIndex: () => undefined
      }
    },
    respondToPrompt
  }
})

describe('routeWorkerPromptToCoordinator', () => {
  it('mails its run a question shaped like an ask, carrying the pending prompt id', async () => {
    const ctx = setup()
    items = [journalItem(approval())]
    expect(await routeWorkerPromptToCoordinator(ctx.deps, promptEvent())).toBe(true)
    const [message] = ctx.mail()
    expect(message).toMatchObject({ type: 'question', from_handle: `dispatch:${ctx.dispatch.id}` })
    expect(message.body).toContain('Approval needed: Run rm -rf build')
    expect(message.body).toContain('Reply allow, allow-always or deny')
    const payload = JSON.parse(message.payload ?? '{}')
    expect(payload).toMatchObject({
      promptId: 'item-1',
      kind: 'approval',
      promptRef: { sessionId: CHAT_SESSION, promptId: 'item-1', kind: 'approval' }
    })
    expect(payload.options).toEqual(['Allow', 'Allow for session', 'Reject'])
    expect(ctx.notify).toHaveBeenCalledWith(message.to_handle, 'question')
  })

  it('mails a question prompt with its offered options', async () => {
    const ctx = setup()
    items = [journalItem(question())]
    expect(await routeWorkerPromptToCoordinator(ctx.deps, promptEvent())).toBe(true)
    const [message] = ctx.mail()
    expect(message.body).toContain('Which database?')
    expect(JSON.parse(message.payload ?? '{}').options).toEqual(['SQLite', 'Postgres'])
  })

  it('mails once per prompt', async () => {
    const ctx = setup()
    items = [journalItem(approval())]
    expect(await routeWorkerPromptToCoordinator(ctx.deps, promptEvent())).toBe(true)
    expect(await routeWorkerPromptToCoordinator(ctx.deps, promptEvent())).toBe(false)
    expect(ctx.mail()).toHaveLength(1)
  })

  it('mails nothing for a session without an open dispatch, a settled prompt, or a plain turn end', async () => {
    const unassigned = setup()
    unassigned.db.completeDispatch(unassigned.dispatch.id)
    items = [journalItem(approval())]
    expect(await routeWorkerPromptToCoordinator(unassigned.deps, promptEvent())).toBe(false)

    const settled = setup()
    items = [
      journalItem(
        approval({
          ...pending,
          state: 'resolved',
          selectedOptionId: 'allow',
          resolvedBy: 'chat',
          resolvedAt: 2
        })
      )
    ]
    expect(await routeWorkerPromptToCoordinator(settled.deps, promptEvent())).toBe(false)
    expect(settled.mail()).toEqual([])

    const quiet = setup()
    items = [journalItem(approval())]
    expect(
      await routeWorkerPromptToCoordinator(quiet.deps, {
        type: 'completion',
        completion: {
          scope: {
            executionHostId: LOCAL_EXECUTION_HOST_ID,
            wslDistro: null,
            workspaceId: 'repo::/tmp/wt',
            workspaceKind: 'git-worktree'
          },
          sessionId: CHAT_SESSION,
          turnId: 'turn-1',
          outcome: 'success',
          completedAt: 1
        }
      })
    ).toBe(false)
    expect(quiet.mail()).toEqual([])
  })

  it('runs beside the stop reporter without replacing its escalation', async () => {
    const ctx = setup()
    items = [journalItem(approval())]
    await routeWorkerPromptToCoordinator(ctx.deps, promptEvent())
    const report = chatWorkerTurnStopReporter(ctx.deps, (run) => run())
    report(promptEvent(), () => ({ status: 'attention' as const, lastAssistantMessage: 'May I?' }))
    expect(ctx.mail(['escalation', 'question']).map((m) => m.type)).toEqual([
      'question',
      'escalation'
    ])
  })
})

describe('resolveWorkerPromptReply', () => {
  async function asked() {
    const ctx = setup()
    items = [journalItem(approval())]
    await routeWorkerPromptToCoordinator(ctx.deps, promptEvent())
    const [message] = ctx.mail()
    return { ctx, original: ctx.db.getMessageById(message.id) }
  }

  it('answers an approval by keyword, mapping allow-always onto the provider option', async () => {
    const { ctx, original } = await asked()
    await resolveWorkerPromptReply(ctx.db, original, 'allow-always keep the flag')
    expect(respondToPrompt).toHaveBeenCalledTimes(1)
    const [caller, params] = respondToPrompt.mock.calls[0]
    expect(caller.callerKey).toContain('orchestration:prompt:')
    expect(params).toMatchObject({
      itemId: 'item-1',
      expectedRevision: 2,
      kind: 'approval',
      optionId: 'allowForSession'
    })
    expect(params.envelope).toMatchObject({ sessionId: CHAT_SESSION, expectedRuntimeFence: 3 })
    expect(params.envelope.payloadFingerprint).toBe(
      computeAgentSessionPayloadFingerprint({
        method: 'agentSession.respondToApproval',
        sessionId: CHAT_SESSION,
        fields: { itemId: 'item-1', expectedRevision: 2, optionId: 'allowForSession' }
      })
    )
  })

  it('answers a question with the chosen option label, or free text when allowed', async () => {
    const ctx = setup()
    items = [journalItem(question())]
    await routeWorkerPromptToCoordinator(ctx.deps, promptEvent())
    const [message] = ctx.mail()
    await resolveWorkerPromptReply(ctx.db, ctx.db.getMessageById(message.id), 'Postgres')
    expect(respondToPrompt.mock.calls[0][1]).toMatchObject({
      kind: 'question',
      answers: [{ questionId: expect.any(String), optionIds: ['opt-postgres'] }]
    })

    const free = setup()
    items = [journalItem(question({ freeTextQuestionId: 'q1', options: [], freeTextInput: {} }))]
    await routeWorkerPromptToCoordinator(free.deps, promptEvent())
    const [freeMail] = free.mail()
    await resolveWorkerPromptReply(
      free.db,
      free.db.getMessageById(freeMail.id),
      'sqlite on the edge'
    )
    expect(respondToPrompt.mock.calls[1][1]).toMatchObject({
      answers: [{ questionId: 'q1', optionIds: [], other: 'sqlite on the edge' }]
    })
  })

  it('refuses a reply that matches no option with a typed error, leaving the question open', async () => {
    const { ctx, original } = await asked()
    await expect(resolveWorkerPromptReply(ctx.db, original, 'maybe')).rejects.toMatchObject({
      code: 'invalid_reply'
    })
    expect(respondToPrompt).not.toHaveBeenCalled()
    expect(ctx.db.getQuestion(original.id)?.status).toBe('pending')
  })

  it('closes the question and reports a typed error when the prompt was answered in chat first', async () => {
    const { ctx, original } = await asked()
    items = [
      journalItem(
        approval({
          ...pending,
          state: 'resolved',
          selectedOptionId: 'allow',
          resolvedBy: 'chat',
          resolvedAt: 2
        })
      )
    ]
    await expect(resolveWorkerPromptReply(ctx.db, original, 'allow')).rejects.toMatchObject({
      code: 'prompt_not_pending'
    })
    expect(respondToPrompt).not.toHaveBeenCalled()
    expect(ctx.db.getQuestion(original.id)?.status).toBe('closed')
  })

  it('closes the question when the prompt is gone, and is a no-op for an ordinary question', async () => {
    const { ctx, original } = await asked()
    items = []
    await expect(resolveWorkerPromptReply(ctx.db, original, 'allow')).rejects.toMatchObject({
      code: 'prompt_not_pending'
    })
    expect(ctx.db.getQuestion(original.id)?.status).toBe('closed')

    const ordinary = setup()
    const ordinaryQuestion = ordinary.db.createQuestion({
      runId: ordinary.run.id,
      dispatchId: ordinary.dispatch.id,
      askerHandle: FROM,
      question: 'Which file?'
    })
    await resolveWorkerPromptReply(
      ordinary.db,
      ordinary.db.getMessageById(ordinaryQuestion.message.id),
      'main.ts'
    )
    expect(respondToPrompt).not.toHaveBeenCalled()
    expect(ordinary.db.getQuestion(ordinaryQuestion.message.id)?.status).toBe('pending')
  })

  it('surfaces a refused prompt answer as a typed error', async () => {
    const { ctx, original } = await asked()
    respondToPrompt.mockResolvedValue({
      ok: false as const,
      refusal: { code: 'agent_session_operation_invalid', message: 'fence moved' }
    })
    await expect(resolveWorkerPromptReply(ctx.db, original, 'allow')).rejects.toMatchObject({
      code: 'prompt_answer_refused'
    })
    expect(ctx.db.getQuestion(original.id)?.status).toBe('pending')
  })
})
