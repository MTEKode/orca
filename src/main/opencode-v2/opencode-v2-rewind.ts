import type { AgentSessionRewindReason } from '../../shared/agent-session/lifecycle/agent-session-rewind'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { clientStatus, isTaggedError } from './opencode-v2-connection'
import { listOpenCodeV2History } from './opencode-v2-session-store'
import type { OpenCodeV2Client } from './opencode-v2-client'

type Result = { ok: true } | { ok: false; reason: AgentSessionRewindReason }

/** The slice of a live session rewind needs; the journal turn id is the provider user message id. */
export type OpenCodeV2RewindSession = {
  client: OpenCodeV2Client
  providerSessionId: string | null
  closed: boolean
  input: { fence: number }
  lane: { openTurnId: string | null } | null
  heldSends: ReadonlySet<string>
}

type Input = { fence: number; beforeTurnId: string }

function refusal(error: unknown): AgentSessionRewindReason {
  const status = clientStatus(error)
  if (
    status === 409 ||
    isTaggedError(error, 'SessionBusyError') ||
    isTaggedError(error, 'ConflictError')
  ) {
    return 'busy'
  }
  if (status === 404 || isTaggedError(error, 'NotFoundError')) {
    return 'invalid-target'
  }
  // A tagged error or 4xx status is the server's answer, so nothing ran; anything else lost the reply.
  const tagged = typeof (error as { _tag?: unknown } | null)?._tag === 'string'
  return tagged || (status !== null && status >= 400 && status < 500)
    ? 'provider-refused'
    : 'outcome-unknown'
}

function live(
  session: OpenCodeV2RewindSession | undefined,
  fence: number
): OpenCodeV2RewindSession | Result {
  if (!session || session.closed || !session.providerSessionId || session.input.fence !== fence) {
    return { ok: false, reason: 'invalid-target' }
  }
  return session.lane?.openTurnId || session.heldSends.size > 0
    ? { ok: false, reason: 'busy' }
    : session
}

async function userTurns(session: OpenCodeV2RewindSession): Promise<string[]> {
  const messages = await listOpenCodeV2History(session.client, session.providerSessionId!)
  return messages.filter((m) => m.type === 'user').map((m) => m.id)
}

/** Stage then commit the revert at the turn's user message. A busy refusal is never retried. */
export async function rewindOpenCodeV2Session(
  session: OpenCodeV2RewindSession | undefined,
  input: Input
): Promise<Result> {
  const checked = live(session, input.fence)
  if ('ok' in checked) {
    return checked
  }
  const sessionID = checked.providerSessionId!
  try {
    if (!(await userTurns(checked)).includes(input.beforeTurnId)) {
      return { ok: false, reason: 'invalid-target' }
    }
  } catch (error) {
    // Nothing was sent yet, so a failed read is a refusal, not an unknown outcome.
    const reason = refusal(error)
    return { ok: false, reason: reason === 'outcome-unknown' ? 'provider-refused' : reason }
  }
  try {
    await checked.client.session.revert.stage({ sessionID, messageID: input.beforeTurnId })
  } catch (error) {
    return { ok: false, reason: refusal(error) }
  }
  try {
    await checked.client.session.revert.commit({ sessionID })
    return { ok: true }
  } catch (error) {
    const reason = refusal(error)
    if (reason !== 'outcome-unknown') {
      // Answered refusal: drop the staged revert so the session is not left half-reverted.
      await checked.client.session.revert.clear({ sessionID }).catch(() => undefined)
    }
    return { ok: false, reason }
  }
}

/** A lost reply counts as applied only when history now ends at the kept turn without the target. */
export async function recoverOpenCodeV2Rewind(
  session: OpenCodeV2RewindSession | undefined,
  input: Input & { keptTurnId: string | null }
): Promise<Result> {
  const checked = live(session, input.fence)
  if ('ok' in checked) {
    return checked
  }
  let turns: string[]
  try {
    turns = await userTurns(checked)
  } catch {
    return { ok: false, reason: 'outcome-unknown' }
  }
  if (turns.includes(input.beforeTurnId)) {
    return { ok: false, reason: 'provider-refused' }
  }
  return turns.at(-1) === (input.keptTurnId ?? undefined)
    ? { ok: true }
    : { ok: false, reason: 'outcome-unknown' }
}

/** The adapter's rewind trio over its session lookup; support is just "live session". */
export function openCodeV2RewindOps(find: (id: string) => OpenCodeV2RewindSession | undefined) {
  return {
    rewindSupport: ((id) =>
      find(id)?.providerSessionId
        ? { supported: true }
        : { supported: false, reason: 'invalid-target' }) as NonNullable<
      StructuredAgentSessionAdapter['rewindSupport']
    >,
    rewind: ((i) => rewindOpenCodeV2Session(find(i.sessionId), i)) as NonNullable<
      StructuredAgentSessionAdapter['rewind']
    >,
    recoverRewind: ((i) => recoverOpenCodeV2Rewind(find(i.sessionId), i)) as NonNullable<
      StructuredAgentSessionAdapter['recoverRewind']
    >
  }
}
