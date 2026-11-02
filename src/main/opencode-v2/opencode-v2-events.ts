import type { OpenCodeEvent } from '@opencode/client'
import type { StructuredAgentSessionLogger } from '../native-chat/agent-session-wire/structured-agent-session-logger'

/** Chat-relevant subscription filter; the stream always adds server.connected itself. */
export const OPENCODE_V2_CHAT_EVENT_TYPES = [
  'session.status',
  'session.idle',
  'session.execution.started',
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
  'session.step.started',
  'session.step.ended',
  'session.text.started',
  'session.text.delta',
  'session.text.ended',
  'session.reasoning.started',
  'session.reasoning.delta',
  'session.reasoning.ended',
  'session.tool.input.started',
  'session.tool.input.delta',
  'session.tool.input.ended',
  'session.tool.called',
  'session.tool.progress',
  'session.tool.success',
  'session.tool.failed',
  'session.usage.updated',
  'session.inbox.enqueued',
  'session.inbox.delivered',
  'session.inbox.cancelled',
  'session.retry.scheduled',
  'session.compaction.started',
  'session.compaction.ended',
  'session.compaction.failed',
  'session.model.selected',
  'permission.asked',
  'permission.replied'
] as const

export type OpenCodeV2ChatEventType = (typeof OPENCODE_V2_CHAT_EVENT_TYPES)[number]

export type OpenCodeV2SessionListener = {
  event(event: OpenCodeEvent): void
  /** The stream (re)connected: live-only events since the last marker may be lost. */
  resync(): void
}

export type OpenCodeV2EventSubscribe = (options: {
  types?: readonly OpenCodeV2ChatEventType[]
  signal: AbortSignal
}) => AsyncIterable<OpenCodeEvent>

export function openCodeV2EventSessionId(event: OpenCodeEvent): string | null {
  if (event.type === 'server.connected') {
    return null
  }
  const data: unknown = 'data' in event ? event.data : undefined
  if (typeof data === 'object' && data !== null && 'sessionID' in data) {
    const id = (data as { sessionID?: unknown }).sessionID
    return typeof id === 'string' ? id : null
  }
  return null
}

const MAX_RECONNECT_DELAY_MS = 15_000

/** ONE subscription per service endpoint; late subscribers resync from the server.connected marker. */
export class OpenCodeV2EventHub {
  private readonly listeners = new Map<string, Set<OpenCodeV2SessionListener>>()
  private controller: AbortController | null = null
  private running = false
  private reconnectDelay: number
  private disposed = false

  constructor(
    private readonly subscribe: OpenCodeV2EventSubscribe,
    private readonly logger?: StructuredAgentSessionLogger,
    private readonly initialReconnectDelayMs = 250
  ) {
    this.reconnectDelay = initialReconnectDelayMs
  }

  attach(sessionId: string, listener: OpenCodeV2SessionListener): () => void {
    let set = this.listeners.get(sessionId)
    if (!set) {
      set = new Set()
      this.listeners.set(sessionId, set)
    }
    set.add(listener)
    this.start()
    return () => {
      const current = this.listeners.get(sessionId)
      if (!current) {
        return
      }
      current.delete(listener)
      if (current.size === 0) {
        this.listeners.delete(sessionId)
      }
      if (this.listeners.size === 0) {
        this.stop()
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    this.stop()
  }

  private start(): void {
    if (this.running || this.disposed) {
      return
    }
    this.running = true
    void this.loop()
  }

  private stop(): void {
    this.running = false
    this.controller?.abort()
    this.controller = null
  }

  private async loop(): Promise<void> {
    while (this.running && !this.disposed && this.listeners.size > 0) {
      const controller = new AbortController()
      this.controller = controller
      try {
        const stream = this.subscribe({
          types: OPENCODE_V2_CHAT_EVENT_TYPES,
          signal: controller.signal
        })
        for await (const event of stream) {
          this.reconnectDelay = this.initialReconnectDelayMs
          this.fanOut(event)
        }
      } catch (error) {
        if (!controller.signal.aborted && !this.disposed) {
          this.logger?.warn('OpenCode v2 event stream failed; reconnecting', {
            scope: 'opencode-v2-events',
            error
          })
        }
      }
      if (!this.running || this.disposed || this.listeners.size === 0) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, this.reconnectDelay).unref?.())
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
    }
    this.running = false
  }

  private fanOut(event: OpenCodeEvent): void {
    if (event.type === 'server.connected') {
      for (const set of this.listeners.values()) {
        for (const listener of set) {
          this.guard(() => listener.resync())
        }
      }
      return
    }
    const sessionId = openCodeV2EventSessionId(event)
    if (sessionId === null) {
      return
    }
    for (const listener of this.listeners.get(sessionId) ?? []) {
      this.guard(() => listener.event(event))
    }
  }

  private guard(run: () => void): void {
    try {
      run()
    } catch (error) {
      this.logger?.warn('OpenCode v2 event listener failed', {
        scope: 'opencode-v2-events',
        error
      })
    }
  }
}

const hubs = new Map<string, OpenCodeV2EventHub>()

/** The shared hub of one endpoint URL, created on first use. */
export function openCodeV2EventHub(
  endpointUrl: string,
  create: () => OpenCodeV2EventHub
): OpenCodeV2EventHub {
  let hub = hubs.get(endpointUrl)
  if (!hub) {
    hub = create()
    hubs.set(endpointUrl, hub)
  }
  return hub
}

export function disposeOpenCodeV2EventHubs(): void {
  for (const hub of hubs.values()) {
    hub.dispose()
  }
  hubs.clear()
}
