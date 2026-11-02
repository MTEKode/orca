import { describe, expect, it } from 'vitest'
import type { ProviderTimelineEvent } from '../native-chat/agent-session-timeline/provider-timeline-event'
import { loadOpenCodeV2Fixture } from './opencode-v2.test-support'
import { OpenCodeV2TurnTranslator } from './opencode-v2-turn-translation'

function run(
  fixture: string,
  deps: {
    contextWindowTokens?: () => number | null
    commandTurnOpen?: () => boolean
    autoApprovePermissions?: () => boolean
    onPermissionAsked?: (request: { id: string; autoApproved: boolean }) => void
  } = {}
): ProviderTimelineEvent[] {
  const translator = new OpenCodeV2TurnTranslator({
    providerSessionId: 'ses_test',
    now: () => 1_000,
    ...deps
  })
  const events: ProviderTimelineEvent[] = []
  for (const event of loadOpenCodeV2Fixture(fixture)) {
    events.push(...translator.receive(event))
  }
  return events
}

function types(events: ProviderTimelineEvent[]): string[] {
  return events.map((event) => event.type)
}

describe('OpenCodeV2TurnTranslator golden scripts', () => {
  it('assembles text deltas by ordinal and ends the turn on success', () => {
    const events = run('opencode-v2-text')
    expect(types(events)).toEqual([
      'turn.open',
      'text.delta',
      'text.delta',
      'text.close',
      'context.usage',
      'context.usage',
      'turn.end'
    ])
    const open = events[0]
    expect(open).toMatchObject({ type: 'turn.open', turn: 'msg_user_1' })
    const deltas = events.filter((event) => event.type === 'text.delta')
    expect(deltas[0]).toMatchObject({
      item: { id: 'text:msg_asst_1:0' },
      channel: 'assistant',
      text: 'Hello'
    })
    expect(deltas[1]).toMatchObject({ text: ' world' })
    expect(events[3]).toMatchObject({
      type: 'text.close',
      item: { id: 'text:msg_asst_1:0' },
      text: 'Hello world'
    })
    const usage = events[4]
    expect(usage).toMatchObject({
      type: 'context.usage',
      usage: {
        used: {
          kind: 'estimate',
          usage: {
            inputTokens: 100,
            cacheCreationInputTokens: 10,
            cacheReadInputTokens: 50,
            outputTokens: 25
          }
        }
      }
    })
    expect(events.at(-1)).toMatchObject({
      type: 'turn.end',
      turn: 'msg_user_1',
      state: 'completed',
      outcome: 'success'
    })
    // session.idle after a terminal execution event writes no second end.
    expect(events.filter((event) => event.type === 'turn.end')).toHaveLength(1)
  })

  it('adds the context window when the running model is known', () => {
    const events = run('opencode-v2-text', { contextWindowTokens: () => 200_000 })
    const usage = events.find((event) => event.type === 'context.usage')
    expect(usage).toMatchObject({
      type: 'context.usage',
      usage: { window: { tokens: 200_000 } }
    })
  })

  it('streams reasoning on its own channel and item ids', () => {
    const events = run('opencode-v2-reasoning')
    const deltas = events.filter((event) => event.type === 'text.delta')
    expect(deltas).toHaveLength(2)
    expect(deltas[0]).toMatchObject({
      item: { id: 'reasoning:msg_asst_1:0' },
      channel: 'reasoning',
      text: 'think'
    })
    expect(events.some((event) => event.type === 'text.close')).toBe(true)
  })

  it('maps the tool lifecycle incl. streaming input JSON through the normalized vocabulary', () => {
    const events = run('opencode-v2-tool')
    const toolEvents = events.filter(
      (event) => 'item' in event && String(event.item).startsWith('tool:')
    )
    expect(types(toolEvents as ProviderTimelineEvent[])).toEqual([
      'item.open',
      'item.update',
      'item.update',
      'item.close'
    ])
    const open = toolEvents[0] as { body: Record<string, unknown> }
    // 'edit' maps to the shared 'Edit' name so edit cards render.
    expect(open.body).toMatchObject({
      kind: 'tool-call',
      callId: 'tool_1',
      name: 'Edit',
      state: 'running'
    })
    const ended = toolEvents[1] as { body: { input: Record<string, unknown> } }
    expect(ended.body.input).toMatchObject({
      filePath: 'src/a.ts',
      file_path: 'src/a.ts',
      oldString: 'a',
      newString: 'b'
    })
    const close = toolEvents.at(-1) as { body: Record<string, unknown> }
    expect(close.body).toMatchObject({ state: 'completed', exitCode: 0 })
    expect((close.body.output as { head: string }).head).toBe('ok')
  })

  it('ends an interrupted turn as a cancellation', () => {
    const events = run('opencode-v2-interrupted')
    expect(events.at(-1)).toMatchObject({
      type: 'turn.end',
      state: 'interrupted',
      outcome: 'cancellation'
    })
  })

  it('writes a failure row and a failure outcome for a failed execution', () => {
    const events = run('opencode-v2-failed')
    const failure = events.find(
      (event) =>
        event.type === 'item.close' && (event as { item: string }).item.startsWith('error:')
    ) as { body: Record<string, unknown> } | undefined
    expect(failure?.body).toMatchObject({ kind: 'status', tone: 'error' })
    expect(JSON.stringify(failure?.body)).toContain('Rate limited')
    expect(events.at(-1)).toMatchObject({
      type: 'turn.end',
      state: 'completed',
      outcome: 'failure'
    })
  })

  it('reports a scheduled retry as turn activity', () => {
    const events = run('opencode-v2-retry')
    expect(events.some((event) => event.type === 'activity')).toBe(true)
    const activity = events.find((event) => event.type === 'activity') as { text: string }
    expect(activity.text).toContain('attempt 2')
    expect(events.at(-1)).toMatchObject({ type: 'turn.end', outcome: 'success' })
  })

  it('settles a host command turn when manual compaction ends', () => {
    const events = run('opencode-v2-compaction', { commandTurnOpen: () => true })
    expect(events[0]).toMatchObject({ type: 'activity' })
    expect(events.some((event) => event.type === 'item.close')).toBe(true)
    const usage = events.find((event) => event.type === 'context.usage')
    expect(usage).toMatchObject({ type: 'context.usage', usage: { used: { kind: 'unknown' } } })
    expect(events.at(-1)).toMatchObject({
      type: 'turn.end',
      state: 'completed',
      outcome: 'success'
    })
  })

  it('keeps a running turn open while auto-compaction streams inside it', () => {
    const withoutCommand = run('opencode-v2-compaction')
    expect(withoutCommand.some((event) => event.type === 'turn.end')).toBe(false)
  })

  it('opens an approval row on permission.asked and withdraws on replied', () => {
    const asked: { id: string; autoApproved: boolean }[] = []
    const events = run('opencode-v2-permission', {
      onPermissionAsked: (request) => asked.push(request)
    })
    const open = events.find((event) => event.type === 'request.open') as {
      request: string
      body: Record<string, unknown>
    }
    expect(open.request).toBe('per_1')
    expect(open.body).toMatchObject({
      kind: 'approval',
      detail: 'Run this command?',
      options: [
        { id: 'once', label: 'Allow once' },
        { id: 'always', label: 'Always allow' },
        { id: 'reject', label: 'Deny' }
      ]
    })
    expect((open.body.description as string).length).toBeGreaterThan(0)
    expect(events.some((event) => event.type === 'request.withdrawn')).toBe(true)
    expect(asked).toEqual([{ id: 'per_1', autoApproved: false }])
  })

  it('skips the approval row under full access and reports the auto-approval', () => {
    const asked: { id: string; autoApproved: boolean }[] = []
    const events = run('opencode-v2-permission', {
      autoApprovePermissions: () => true,
      onPermissionAsked: (request) => asked.push(request)
    })
    expect(events.some((event) => event.type === 'request.open')).toBe(false)
    expect(asked).toEqual([{ id: 'per_1', autoApproved: true }])
  })

  it('settles a missed terminal from resync facts', () => {
    const translator = new OpenCodeV2TurnTranslator({ providerSessionId: 'ses_test', now: () => 5 })
    translator.receive(loadOpenCodeV2Fixture('opencode-v2-interrupted')[0])
    expect(translator.openTurnId).toBe('msg_user_1')
    // Still busy: the live stream may yet deliver the end.
    expect(translator.settleFromSessionInfo({ busy: true, outcome: 'succeeded' })).toEqual([])
    const events = translator.settleFromSessionInfo({ busy: false, outcome: 'succeeded' })
    expect(events.at(-1)).toMatchObject({
      type: 'turn.end',
      state: 'completed',
      outcome: 'success'
    })
  })
})
