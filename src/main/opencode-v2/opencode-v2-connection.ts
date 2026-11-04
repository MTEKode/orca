import { createHash } from 'node:crypto'
import type { OpenCodeV2Client } from './opencode-v2-client'

/** A reused prompt id: the provider already admitted this exact send. */
export class OpenCodeV2PromptConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenCodeV2PromptConflictError'
  }
}

export type OpenCodeV2PromptFile = {
  uri: string
  source?: { type: 'inline' } | { type: 'uri'; uri: string }
  name?: string
}

export type OpenCodeV2SendInput = {
  text: string
  /** Orca's client message id; mapped to a provider `msg_` id inside the connection. */
  id: string
  files?: OpenCodeV2PromptFile[]
  /** Default 'steer' injects into a running turn; 'queue' waits for the next one. */
  delivery?: 'steer' | 'queue'
  signal?: AbortSignal
}

export type OpenCodeV2ModelRef = { id: string; providerID: string; variant?: string }

function isTaggedError(error: unknown, tag: string): boolean {
  return typeof error === 'object' && error !== null && (error as { _tag?: unknown })._tag === tag
}

function clientStatus(error: unknown): number | null {
  const cause = error instanceof Error ? (error as { cause?: unknown }).cause : undefined
  const status =
    typeof cause === 'object' && cause !== null ? (cause as { status?: unknown }).status : undefined
  return typeof status === 'number' ? status : null
}

const OPENCODE_MESSAGE_ID = /^msg_[0-9a-z]{26}$/

/** OpenCode validates prompt ids as `msg_` + 12 hex (timestamp) + 14 base62-ish chars. */
export function toOpenCodeMessageId(clientMessageId: string, now = Date.now()): string {
  if (OPENCODE_MESSAGE_ID.test(clientMessageId)) {
    return clientMessageId
  }
  const digest = BigInt(`0x${createHash('sha256').update(clientMessageId).digest('hex')}`)
  return `msg_${now.toString(16).padStart(12, '0')}${digest.toString(36).slice(0, 14)}`
}

/** The one HTTP surface this transport uses; every call names its session explicitly. */
export class OpenCodeV2Connection {
  constructor(
    private readonly client: OpenCodeV2Client,
    readonly sessionID: string
  ) {}

  // Keeps retries of one client id on one provider id so the 409 idempotency still holds.
  private readonly providerIds = new Map<string, string>()

  private providerMessageId(clientMessageId: string): string {
    let id = this.providerIds.get(clientMessageId)
    if (!id) {
      id = toOpenCodeMessageId(clientMessageId)
      this.providerIds.set(clientMessageId, id)
    }
    return id
  }

  async send(input: OpenCodeV2SendInput) {
    try {
      return await this.client.session.prompt(
        {
          sessionID: this.sessionID,
          id: this.providerMessageId(input.id),
          text: input.text,
          delivery: input.delivery ?? 'steer',
          ...(input.files?.length
            ? {
                files: input.files.map((file) => ({
                  uri: file.uri,
                  ...(file.source ? { source: file.source } : {}),
                  ...(file.name ? { name: file.name } : {})
                }))
              }
            : {})
        },
        input.signal ? { signal: input.signal } : undefined
      )
    } catch (error) {
      if (isTaggedError(error, 'ConflictError') || clientStatus(error) === 409) {
        throw new OpenCodeV2PromptConflictError(
          error instanceof Error ? error.message : 'prompt id already admitted'
        )
      }
      throw error
    }
  }

  async interrupt(signal?: AbortSignal) {
    return this.client.session.interrupt(
      { sessionID: this.sessionID },
      signal ? { signal } : undefined
    )
  }

  async setModel(model: OpenCodeV2ModelRef, signal?: AbortSignal) {
    return this.client.session.switchModel(
      {
        sessionID: this.sessionID,
        model: {
          id: model.id,
          providerID: model.providerID,
          ...(model.variant ? { variant: model.variant } : {})
        }
      },
      signal ? { signal } : undefined
    )
  }

  async setAgent(agent: string, signal?: AbortSignal) {
    return this.client.session.switchAgent(
      { sessionID: this.sessionID, agent },
      signal ? { signal } : undefined
    )
  }

  async replyForm(
    formID: string,
    answer: Record<string, string | number | boolean | string[]>,
    signal?: AbortSignal
  ) {
    return this.client.session.form.reply(
      { sessionID: this.sessionID, formID, answer },
      signal ? { signal } : undefined
    )
  }

  async cancelForm(formID: string, signal?: AbortSignal) {
    return this.client.session.form.cancel(
      { sessionID: this.sessionID, formID },
      signal ? { signal } : undefined
    )
  }

  async compact(signal?: AbortSignal) {
    return this.client.session.compact(
      { sessionID: this.sessionID },
      signal ? { signal } : undefined
    )
  }

  async replyPermission(
    requestID: string,
    decision: 'once' | 'always' | 'reject',
    message?: string,
    signal?: AbortSignal
  ) {
    return this.client.permission.reply(
      {
        sessionID: this.sessionID,
        requestID,
        decision,
        ...(message ? { message } : {})
      },
      signal ? { signal } : undefined
    )
  }
}
