<<<<<<< HEAD
import { defineMethod } from '../../../core'
import type { TaskStatus } from '../../../../orchestration/db'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { ORCHESTRATION_LEGACY_RUN_ID } from '../../../../../../shared/orchestration-rpc-contract'
import { abbreviateOrchestrationTasks } from '../../../../../../shared/orchestration-task-summary'
import { parseOrchestrationTaskDepsFlag } from '../../../../orchestration/task-deps-flag'
import { orchestrationCallerIdentity, resolveRunScope } from '../runs/run-scope'
import {
  readMutationReplayNudge,
  stripMutationReplayNudge
} from '../../../orchestration-mutation-receipt'
import { exposeMessage } from './mailbox-message-receipt'
import { resolveOrchestrationParty } from '../../../../orchestration/orchestration-party'
import { recordReceiptBeforeNudge, replayMutationNudge } from './mutation-replay-nudge'
import { resolveReplyRecipient } from './recipient-routing'
import { answerQuestionReply } from './question-reply'
import { replyToRemoteRunHome } from './reply-remote'
import {
  ReplyParams,
=======
import { ORCHESTRATION_REPLY_METHOD } from './reply-method'
import { defineOrchestrationMethod } from '../access/orchestration-method-access'
import { inspectedRunAccess, taskCreateAccess, taskUpdateAccess } from '../access/run-access-rules'
import type { TaskStatus } from '../../../../orchestration/db/orchestration-records'
import { abbreviateOrchestrationTasks } from '../../../../../../shared/orchestration/orchestration-task-summary'
import { orchestrationCallerIdentity } from '../runs/run-scope'
import { resolveOrchestrationParty } from '../../../../orchestration/addressing/orchestration-party'
import {
>>>>>>> upstream/main
  InboxParams,
  TaskCreateParams,
  TaskListParams
} from '../../../../../../shared/rpc-contract/orchestration-params'
import { TaskUpdateParams } from './task-update-params'

export const ORCHESTRATION_MESSAGE_METHODS = [
<<<<<<< HEAD
  defineMethod({
    name: 'orchestration.reply',
    permission: 'workspace',
    params: ReplyParams,
    handler: async (
      params,
      {
        orchestrationCompatibilityEvidence,
        orchestrationCaller,
        runtime,
        legacyCoordinatorRunId,
        recordMutationReceipt,
        replayedMutationReceipt,
        signal
      }
    ) => {
      const replayNudge = readMutationReplayNudge(replayedMutationReceipt)
      if (replayNudge) {
        replayMutationNudge(runtime, replayNudge)
        return stripMutationReplayNudge(replayedMutationReceipt)
      }
      const db = runtime.getOrchestrationDb()
      const original = db.getMessageById(params.id)
      if (!original) {
        throw new Error(`Message not found: ${params.id}`)
      }
      if (
        legacyCoordinatorRunId &&
        (original.run_id !== legacyCoordinatorRunId ||
          (params.run !== undefined && params.run !== legacyCoordinatorRunId))
      ) {
        throw new OrchestrationError(
          'request_mismatch',
          `Message ${params.id} does not belong to this adopted Run.`,
          { effectsApplied: false }
        )
      }
      if (
        original.run_id === ORCHESTRATION_LEGACY_RUN_ID ||
        original.delivery_contract === 'legacy_direct' ||
        original.delivery_contract === 'audit_only'
      ) {
        throw new OrchestrationError(
          'legacy_read_only',
          'Legacy orchestration messages are inspect-only; no reply was applied.',
          { effectsApplied: false }
        )
      }

      const question = db.getQuestion(params.id)
      if (question) {
        return await answerQuestionReply({
          runtime,
          db,
          question,
          original,
          params,
          callerSession: orchestrationCaller,
          callerEvidence: orchestrationCompatibilityEvidence,
          legacyCoordinatorRunId,
          recordMutationReceipt
        })
      }

      if (db.getRun(original.run_id)?.home_database === 'remote') {
        return await replyToRemoteRunHome({ runtime, db, original, params, signal })
      }
      const recipient = resolveReplyRecipient({
        runtime,
        db,
        originalFrom: original.from_handle,
        originalRunId: original.run_id
      })
      db.markAsRead([original.id])
      const reply = db.insertMessage({
        from: params.from ?? original.to_handle,
        to: recipient.to,
        subject: `Re: ${original.subject}`,
        body: params.body,
        threadId: original.thread_id ?? original.id,
        runId: recipient.runId
      })

      const receipt = { message: exposeMessage(reply) }
      return recordReceiptBeforeNudge(recordMutationReceipt, receipt, () =>
        runtime.notifyMessageArrived(reply.to_handle, reply.type)
      )
    }
  }),

  defineMethod({
=======
  ORCHESTRATION_REPLY_METHOD,
  defineOrchestrationMethod({
>>>>>>> upstream/main
    name: 'orchestration.inbox',
    permission: 'workspace',
    params: InboxParams,
    access: { kind: 'reads', targets: { terminal: 'party' }, collection: true },
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      // Return empty for stale/unknown handles because historical mail outlives handle deletion (design doc §3.3).
      const messages = params.terminal
        ? db.getAllMessagesForHandle(
            resolveOrchestrationParty(params.terminal, db).address,
            params.limit
          )
        : db.getInbox(params.limit)
      return {
        messages: messages.map(({ answer_sender_snapshot: _answer, ...message }) => message),
        count: messages.length
      }
    }
  }),

  defineOrchestrationMethod({
    name: 'orchestration.taskCreate',
    permission: 'workspace',
    params: TaskCreateParams,
    access: {
      kind: 'writes',
      caller: 'callerTerminalHandle',
      targets: { run: 'run', parent: 'task', deps: 'task' },
      rule: taskCreateAccess
    },
    handler: (params, { orchestrationCaller, runtime }, { run, deps }) => {
      const db = runtime.getOrchestrationDb()
      // A handle-less session creates root Tasks: Task lineage is recorded by terminal only.
      const creatorHandle = params.callerTerminalHandle
        ? orchestrationCallerIdentity(runtime, {
            handle: params.callerTerminalHandle,
            session: orchestrationCaller,
            paneKey: null
          }).terminalHandle
        : null
      const creatorAuthority = creatorHandle
        ? runtime.getOrchestrationDispatchAuthority(creatorHandle)
        : null
      const task = db.createTask({
        spec: params.spec,
        taskTitle: params.taskTitle,
        displayName: params.displayName,
        deps,
        parentId: params.parent,
        createdByTerminalHandle: creatorHandle ?? undefined,
        ...(creatorAuthority?.paneKey && creatorAuthority.processIncarnation
          ? {
              createdByPaneKey: creatorAuthority.paneKey,
              createdByProcessIncarnation: creatorAuthority.processIncarnation,
              createdByRunGeneration: run.consumer_generation
            }
          : {}),
        runId: run.id
      })
      return { task }
    }
  }),

  defineOrchestrationMethod({
    name: 'orchestration.taskList',
    permission: 'workspace',
    params: TaskListParams,
    access: {
      kind: 'reads',
      caller: 'callerTerminalHandle',
      targets: { run: 'run' },
      collection: true,
      rule: inspectedRunAccess
    },
    handler: (params, { runtime }, { run }) => {
      const db = runtime.getOrchestrationDb()
      // Add nullable assignee_handle/dispatch_id without changing legacy non-dispatched rows.
      const joined = db.listTasksWithDispatch({
        status: params.status as TaskStatus,
        ready: params.ready,
        runId: run.id
      })
      const tasks = joined.map((row) => {
        const { assignee_handle, dispatch_id, ...base } = row
        if (base.status === 'dispatched') {
          return { ...base, assignee_handle, dispatch_id }
        }
        return base
      })
      return {
        runId: run.id,
        legacyReadOnly: run.legacy === 1,
        tasks: params.brief ? abbreviateOrchestrationTasks(tasks) : tasks,
        count: tasks.length
      }
    }
  }),

  defineOrchestrationMethod({
    name: 'orchestration.taskUpdate',
    permission: 'workspace',
    params: TaskUpdateParams,
    access: {
      kind: 'writes',
      caller: 'callerTerminalHandle',
      targets: { id: 'task', run: 'run' },
      rule: taskUpdateAccess
    },
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const task = db.updateTaskStatus(params.id, params.status, params.result)
      if (!task) {
        throw new Error(`Task not found: ${params.id}`)
      }
      return { task }
    }
  })
]
