import type { OrchestrationDb } from '../../../../orchestration/db'
import type { MessageRow, QuestionRow } from '../../../../orchestration/db/orchestration-records'
import type { OrchestrationSessionCaller } from '../../../../orchestration/addressing/orchestration-caller-identity'
import { deliverQuestionAnswer } from '../../../../orchestration/mailbox/questions/question-answer-delivery'
import { resolveWorkerPromptReply } from '../../../../orchestration/worker-prompt-routing'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { OrchestrationCompatibilityEvidence } from '../../../../../../shared/orchestration/orchestration-compatibility-evidence'
import { resolveRunScope } from '../runs/run-scope'
import { withAnswerNext } from '../receipt-next'
import { helperQuestionAnswerer } from './helper-question-answerer'
import { exposeMessage } from './mailbox-message-receipt'
import { recordReceiptBeforeNudge } from './mutation-replay-nudge'

/** Answer a Run's question: its creator's helper, its current consumer, or a federated relay home.
 *  Caller authority is checked first, then a question standing for a worker's prompt resolves that prompt; a stale one closes the
 *  question with a typed error instead of answering twice. */
export async function answerQuestionReply(args: {
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  question: QuestionRow
  original: MessageRow
  params: { body: string; from?: string; run?: string }
  callerSession?: OrchestrationSessionCaller
  callerEvidence?: OrchestrationCompatibilityEvidence
  legacyCoordinatorRunId?: string
  recordMutationReceipt?: (receipt: unknown) => void
}): Promise<unknown> {
  const { runtime, db, question, original, params, recordMutationReceipt } = args
  const creatorAnswerer =
    params.run === undefined || params.run === question.run_id
      ? helperQuestionAnswerer(runtime, {
          question: original,
          from: params.from,
          session: args.callerSession,
          evidence: args.callerEvidence
        })
      : undefined
  if (creatorAnswerer) {
    await resolveWorkerPromptReply(db, original, params.body)
    const answered = db.answerQuestion({
      messageId: question.message_id,
      runId: question.run_id,
      answeredBy: creatorAnswerer,
      body: params.body
    })
    return recordReceiptBeforeNudge(
      recordMutationReceipt,
      { ...answered, message: exposeMessage(answered.message) },
      () => deliverQuestionAnswer(runtime, question)
    )
  }
  const run = resolveRunScope(runtime, {
    runId: params.run ?? question.run_id,
    callerTerminalHandle: params.from,
    requireCurrentConsumer: true,
    legacyCoordinatorRunId: args.legacyCoordinatorRunId,
    callerEvidence: args.callerEvidence,
    callerSession: args.callerSession
  })
  await resolveWorkerPromptReply(db, original, params.body)
  const answered = db.answerQuestion({
    messageId: question.message_id,
    runId: run.id,
    consumerGeneration: run.consumer_generation,
    body: params.body
  })
  const federated = db.getFederatedDispatch(question.dispatch_id)
  const receipt = withAnswerNext({
    message: exposeMessage(answered.message),
    question: answered.question,
    duplicate: answered.duplicate
  })
  if (federated) {
    db.enqueueFederationRelay({
      dispatchId: question.dispatch_id,
      direction: 'to_worker',
      kind: 'reply',
      payload: JSON.stringify({
        questionId: question.message_id,
        answerMessageId: answered.message.id,
        body: params.body
      })
    })
    return recordReceiptBeforeNudge(
      recordMutationReceipt,
      receipt,
      () => runtime.ensureOrchestrationFederationRelay(run.id),
      { kind: 'federation', runId: run.id }
    )
  }
  return recordReceiptBeforeNudge(recordMutationReceipt, receipt, () =>
    deliverQuestionAnswer(runtime, question)
  )
}
