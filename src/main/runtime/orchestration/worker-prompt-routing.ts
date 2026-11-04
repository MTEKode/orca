import { randomUUID } from 'node:crypto'
import type { AgentSessionTurnCompletionEvent } from '../../../shared/agent-session/view/agent-session-turn-completion-wire'
import type {
  AgentJournalApprovalItem,
  AgentJournalQuestionItem,
  AgentJournalRenderItem
} from '../../../shared/agent-session/journal/agent-session-journal-types'
import { computeAgentSessionPayloadFingerprint } from '../../../shared/agent-session/lifecycle/agent-session-mutation-envelope'
import { getStructuredAgentSessionHost } from '../../native-chat/agent-session-wire/structured-agent-session-registry'
import type { WorkerTurnStopReportDeps } from './worker-turn-stop-report'
import { chatWorkerDispatches } from './chat-worker-error-escalation'
import { dispatchReportMailbox } from './dispatch-report-mailbox'
import type { OrchestrationDb } from './db'
import type { MessageRow } from './types'
import { OrchestrationError } from './orchestration-error'
import { approvalReplyOption, questionReplyResponse } from './worker-prompt-reply'

type PromptBody = AgentJournalApprovalItem | AgentJournalQuestionItem

type ReadPrompt = {
  host: NonNullable<ReturnType<typeof getStructuredAgentSessionHost>>
  item: AgentJournalRenderItem
  body: PromptBody
}

/** What a question mail records so a reply can find the prompt again, also after a restart. */
export type WorkerPromptRef = {
  sessionId: string
  promptId: string
  kind: 'approval' | 'question'
}

type PromptBackedMessage = Pick<MessageRow, 'payload'>

/** The prompt a question stands for; absent on an ordinary `ask`. */
export function readWorkerPromptRef(message: PromptBackedMessage): WorkerPromptRef | undefined {
  if (!message.payload) {
    return undefined
  }
  try {
    const ref = (JSON.parse(message.payload) as { promptRef?: Partial<WorkerPromptRef> }).promptRef
    return ref &&
      typeof ref.sessionId === 'string' &&
      typeof ref.promptId === 'string' &&
      (ref.kind === 'approval' || ref.kind === 'question')
      ? { sessionId: ref.sessionId, promptId: ref.promptId, kind: ref.kind }
      : undefined
  } catch {
    return undefined
  }
}

type Deps = Pick<WorkerTurnStopReportDeps, 'getDb' | 'notify'>

// A prompt edge is emitted once per pending prompt; the cap keeps a long-lived host from retaining them all.
const ASKED_PROMPT_LIMIT = 512
const askedByDb = new WeakMap<OrchestrationDb, Set<string>>()

function remember(db: OrchestrationDb, key: string): boolean {
  const asked = askedByDb.get(db) ?? new Set<string>()
  askedByDb.set(db, asked)
  if (asked.has(key)) {
    return false
  }
  asked.add(key)
  const [oldest] = asked
  if (asked.size > ASKED_PROMPT_LIMIT && oldest !== undefined) {
    asked.delete(oldest)
  }
  return true
}

async function readPrompt(sessionId: string, promptId: string): Promise<ReadPrompt | null> {
  const host = getStructuredAgentSessionHost()
  if (!host) {
    return null
  }
  const item = (await host.journalSnapshot(sessionId)).items.find((i) => i.itemId === promptId)
  const body = item?.body
  return item && (body?.kind === 'approval' || body?.kind === 'question')
    ? { host, item, body }
    : null
}

function describe(body: PromptBody): { text: string; options: string[] } {
  const options = body.options.map((option) => option.label || option.id)
  const text =
    body.kind === 'approval'
      ? `Approval needed: ${body.title}${body.detail ? `\n${body.detail}` : ''}\nReply allow, allow-always or deny (optionally followed by a message).`
      : `${body.question}\nReply with one of the options or free text.`
  return { text, options }
}

/** A structured worker raised a prompt: mail its coordinator a `question` the way `ask` would. Returns whether it was mailed. */
export async function routeWorkerPromptToCoordinator(
  deps: Deps,
  event: AgentSessionTurnCompletionEvent
): Promise<boolean> {
  if (event.type !== 'prompt') {
    return false
  }
  const { sessionId, promptId } = event.prompt
  try {
    const db = deps.getDb()
    const found = db ? await readPrompt(sessionId, promptId) : null
    // A prompt answered in the worker's chat before the mail was written needs no mail.
    if (!db || !found || found.body.resolution.state !== 'pending') {
      return false
    }
    const { text, options } = describe(found.body)
    const ref: WorkerPromptRef = { sessionId, promptId, kind: found.body.kind }
    let mailed = false
    for (const { dispatch, from } of chatWorkerDispatches(sessionId, db)) {
      if (!remember(db, `${dispatch.id}:${promptId}`)) {
        continue
      }
      const { message } = db.createQuestion({
        runId: dispatch.run_id,
        dispatchId: dispatch.id,
        askerHandle: from,
        question: text,
        options,
        to: dispatchReportMailbox(db, dispatch),
        payloadExtra: { promptId, kind: found.body.kind, promptRef: ref }
      })
      deps.notify(message.to_handle, 'question')
      mailed = true
    }
    return mailed
  } catch (error) {
    console.warn('[orchestration] worker prompt routing failed', error)
    return false
  }
}

/** Answer the worker's pending prompt before its question is recorded; throws a typed error otherwise. An ordinary question is a no-op. */
export async function resolveWorkerPromptReply(
  db: OrchestrationDb,
  original: PromptBackedMessage & Pick<MessageRow, 'id'>,
  body: string
): Promise<void> {
  const ref = readWorkerPromptRef(original)
  if (!ref) {
    return
  }
  const current = await readPrompt(ref.sessionId, ref.promptId).catch(() => null)
  if (!current || current.body.resolution.state !== 'pending') {
    db.closeQuestion(original.id)
    throw new OrchestrationError(
      'prompt_not_pending',
      current
        ? `The worker's prompt was already ${current.body.resolution.state} in its chat; nothing was sent.`
        : "The worker's prompt is gone (session ended or restarted); nothing was sent."
    )
  }
  const { host, item, body: prompt } = current
  const response =
    prompt.kind === 'approval'
      ? ({ kind: 'option', optionId: approvalReplyOption(prompt, body) } as const)
      : questionReplyResponse(prompt, body)
  const fields = {
    itemId: item.itemId,
    expectedRevision: item.revision,
    ...(response.kind === 'option'
      ? { optionId: response.optionId }
      : { answers: response.answers })
  }
  const record = host.deps.store.getRecord(ref.sessionId)
  try {
    const result = await host.respondToPrompt(
      { callerKey: `trusted-local:orchestration:prompt:${original.id}` },
      {
        ...fields,
        kind: prompt.kind,
        envelope: {
          sessionId: ref.sessionId,
          clientOperationId: randomUUID(),
          expectedRuntimeFence: record?.lease.runtimeFence ?? null,
          payloadFingerprint: computeAgentSessionPayloadFingerprint({
            method:
              prompt.kind === 'approval'
                ? 'agentSession.respondToApproval'
                : 'agentSession.respondToQuestion',
            sessionId: ref.sessionId,
            fields
          })
        }
      }
    )
    if (!result.ok) {
      throw new OrchestrationError(
        'prompt_answer_refused',
        `The worker's prompt could not be answered: ${result.refusal.message ?? result.refusal.code}`
      )
    }
  } catch (error) {
    if (error instanceof OrchestrationError) {
      throw error
    }
    throw new OrchestrationError(
      'prompt_answer_refused',
      `The worker's prompt could not be answered: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
