import {
  agentSessionFailureFact,
  providerDiagnostic,
  type SubmissionRejectionFact
} from '../../shared/agent-session-failure'
import { agentSessionFailureWords } from '../../shared/agent-session-failure-words'
import type {
  AgentSessionCancelOutcome,
  AgentSessionCommandAdmission,
  AgentSessionDispatchOutcome,
  StructuredAgentSessionAdapter,
  StructuredAgentSessionCommandRun,
  StructuredAgentSessionSetOptionInput
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { AgentSessionOptionRejectedError } from '../native-chat/agent-session-wire/structured-agent-session-option-error'
import {
  structuredAgentSessionOptionModels,
  type StructuredAgentSessionLiveOptions
} from '../native-chat/agent-session-wire/structured-agent-session-option-models'
import { OPENCODE_V2_AGENT_DISPLAY_NAME } from './opencode-v2-agent-definition'
import { OpenCodeV2PromptConflictError } from './opencode-v2-connection'
import { OpenCodeV2PromptError, prepareOpenCodeV2Prompt } from './opencode-v2-prompt'
import type { OpenCodeV2Session } from './opencode-v2-session'

type DispatchInput = Parameters<StructuredAgentSessionAdapter['dispatch']>[0]

function rejection(fact: SubmissionRejectionFact): AgentSessionDispatchOutcome {
  return {
    state: 'rejected',
    ...agentSessionFailureWords(fact, {
      agentName: OPENCODE_V2_AGENT_DISPLAY_NAME,
      surface: 'rejection'
    })
  }
}

function providerErrorFact(message: string): SubmissionRejectionFact {
  return agentSessionFailureFact('providerRejected', {
    detail: providerDiagnostic(message, 'person')
  })
}

/** A transport-level failure (no HTTP answer) never authorizes an automatic resend. */
function isTransportError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { name?: string }).name === 'ClientError' ||
      (error as { reason?: unknown }).reason === 'Transport')
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function dispatchOpenCodeV2Message(
  session: OpenCodeV2Session,
  input: DispatchInput,
  isCurrent: () => boolean
): Promise<AgentSessionDispatchOutcome> {
  const lane = session.lane
  const connection = session.connection
  if (!lane || !connection || session.closed) {
    return rejection(agentSessionFailureFact('providerExited'))
  }
  let prompt: { text: string; files: { uri: string }[] }
  try {
    prompt = await prepareOpenCodeV2Prompt(input.body)
  } catch (error) {
    return rejection(
      error instanceof OpenCodeV2PromptError
        ? error.failure
        : agentSessionFailureFact('attachmentUnreadable')
    )
  }
  input.signal?.throwIfAborted()
  if (!isCurrent() || session.closed) {
    return rejection(agentSessionFailureFact('providerExited'))
  }
  input.onInputPreparation?.()
  let ranOptions: Record<string, string> = {}
  try {
    const model = input.executionOptions?.model
    if (model && model !== session.currentModelId) {
      await applyOpenCodeV2SessionOption(session, {
        sessionId: input.sessionId,
        key: 'model',
        value: model,
        fence: input.fence,
        ...(input.signal ? { signal: input.signal } : {})
      })
    }
    input.signal?.throwIfAborted()
    if (!isCurrent() || session.closed) {
      return rejection(agentSessionFailureFact('providerExited'))
    }
    await input.beforeDispatch?.()
    input.onExecutionSnapshot?.()
    ranOptions = session.currentModelId ? { model: session.currentModelId } : {}
    session.heldSends.add(input.clientMessageId)
    try {
      await connection.send({
        text: prompt.text,
        id: input.clientMessageId,
        files: prompt.files,
        delivery: 'steer',
        ...(input.signal ? { signal: input.signal } : {})
      })
    } catch (error) {
      // A reused prompt id proves the provider already admitted this exact send.
      if (!(error instanceof OpenCodeV2PromptConflictError)) {
        session.heldSends.delete(input.clientMessageId)
        if (isTransportError(error) && !session.closed) {
          return { state: 'unknown', reason: 'OpenCode v2 prompt did not settle' }
        }
        return rejection(providerErrorFact(errorMessage(error)))
      }
    }
  } catch (error) {
    input.signal?.throwIfAborted()
    if (error instanceof AgentSessionOptionRejectedError) {
      throw error
    }
    session.heldSends.delete(input.clientMessageId)
    return rejection(providerErrorFact(errorMessage(error)))
  }
  lane.apply([
    {
      type: 'input.accepted',
      clientMessageId: input.clientMessageId,
      requestedAt: input.requestedAt ?? Date.now()
    }
  ])
  return { state: 'admitted', ranOptions }
}

export async function cancelOpenCodeV2Turn(
  session: OpenCodeV2Session,
  input: {
    sessionId: string
    turnId?: string
    fence: number
    resolveLiveTurnId?: () => string | null
  }
): Promise<AgentSessionCancelOutcome> {
  const connection = session.connection
  if (!connection || session.closed) {
    return { cancelled: false }
  }
  const turnId = input.resolveLiveTurnId
    ? input.resolveLiveTurnId()
    : (session.lane?.openTurnId ?? null)
  if (input.turnId !== undefined && input.turnId !== turnId) {
    return { cancelled: false }
  }
  if (!turnId && session.heldSends.size === 0) {
    return { cancelled: false }
  }
  await connection.interrupt()
  return { cancelled: true, ...(turnId ? { turnId } : {}) }
}

export async function compactOpenCodeV2Session(
  session: OpenCodeV2Session,
  command: StructuredAgentSessionCommandRun
): Promise<AgentSessionCommandAdmission> {
  const lane = session.lane
  const connection = session.connection
  if (!lane || !connection || session.closed) {
    return rejection(agentSessionFailureFact('providerExited'))
  }
  lane.beginCommand(command)
  try {
    await connection.compact()
    // The command turn ends when the compaction events settle it.
    return { state: 'accepted', providerIdentity: null }
  } catch (error) {
    lane.forgetCommand(command.turnId)
    return rejection(
      agentSessionFailureFact('providerRejected', {
        detail: providerDiagnostic(errorMessage(error), 'person')
      })
    )
  }
}

export async function applyOpenCodeV2SessionOption(
  session: OpenCodeV2Session,
  input: StructuredAgentSessionSetOptionInput
): Promise<Record<string, string>> {
  if (input.key !== 'model') {
    throw new AgentSessionOptionRejectedError(new Error(`OpenCode v2 has no ${input.key} option`))
  }
  const connection = session.connection
  if (!connection) {
    throw new AgentSessionOptionRejectedError(new Error('OpenCode v2 session is not open'))
  }
  const ref = session.listing.refs.get(input.value)
  if (!ref) {
    throw new AgentSessionOptionRejectedError(new Error('Unknown OpenCode model'))
  }
  try {
    await connection.setModel(ref, input.signal)
  } catch (error) {
    throw new AgentSessionOptionRejectedError(
      error,
      'optionRejected',
      providerErrorFact(errorMessage(error))
    )
  }
  session.currentModelId = input.value
  return { model: input.value }
}

export function readOpenCodeV2SessionOptions(
  session: OpenCodeV2Session
): StructuredAgentSessionLiveOptions {
  const models = structuredAgentSessionOptionModels(
    session.listing.models,
    session.currentModelId ?? undefined,
    (unlisted) => unlisted
  )
  return {
    models,
    acceptsImages: true,
    listedModelIds: session.listing.models.map((model) => model.id),
    current: {
      model: session.currentModelId ?? '',
      ...(session.currentModelId ? { confirmed: ['model'] as readonly string[] } : {})
    }
  }
}
