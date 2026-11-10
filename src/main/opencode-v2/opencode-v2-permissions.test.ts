import { describe, expect, it, vi } from 'vitest'
import {
  AgentSessionPromptAnswerRejectedError,
  AgentSessionPromptUnavailableError
} from '../native-chat/agent-session-wire/providers/structured-agent-session-adapter'
import type { ProviderTimelineEvent } from '../native-chat/agent-session-timeline/provider-timeline-event'
import {
  OpenCodeV2PermissionRequests,
  openCodeV2PermissionDecision
} from './opencode-v2-permissions'

function harness() {
  const replies: { requestID: string; decision: string }[] = []
  const applied: ProviderTimelineEvent[][] = []
  const requests = new OpenCodeV2PermissionRequests({
    isRequestRow: (itemId, key) => itemId === `request:${key}`,
    apply: (events) => applied.push([...events]),
    reply: async (requestID, decision) => {
      replies.push({ requestID, decision })
    }
  })
  return { requests, replies, applied }
}

describe('openCodeV2PermissionDecision', () => {
  it('maps approval options onto the reply vocabulary', () => {
    expect(openCodeV2PermissionDecision({ kind: 'option', optionId: 'once' })).toBe('once')
    expect(openCodeV2PermissionDecision({ kind: 'option', optionId: 'always' })).toBe('always')
    expect(openCodeV2PermissionDecision({ kind: 'option', optionId: 'reject' })).toBe('reject')
    expect(openCodeV2PermissionDecision(null)).toBe('reject')
    expect(openCodeV2PermissionDecision({ kind: 'option', optionId: 'other' })).toBeNull()
  })
})

describe('OpenCodeV2PermissionRequests', () => {
  it('claims through the journal commit, then replies once', async () => {
    const { requests, replies } = harness()
    requests.track('per_1')
    const order: string[] = []
    await requests.answer(
      'request:per_1',
      { kind: 'option', optionId: 'once' },
      async () => {
        order.push('commit')
      },
      true
    )
    order.push('answered')
    expect(order).toEqual(['commit', 'answered'])
    expect(replies).toEqual([{ requestID: 'per_1', decision: 'once' }])
    expect(requests.size).toBe(0)
  })

  it('maps allow-always and deny answers', async () => {
    const { requests, replies } = harness()
    requests.track('per_a')
    requests.track('per_b')
    await requests.answer(
      'request:per_a',
      { kind: 'option', optionId: 'always' },
      async () => {},
      true
    )
    await requests.answer(
      'request:per_b',
      { kind: 'option', optionId: 'reject' },
      async () => {},
      true
    )
    expect(replies).toEqual([
      { requestID: 'per_a', decision: 'always' },
      { requestID: 'per_b', decision: 'reject' }
    ])
  })

  it('refuses an unknown choice and answers a dismissal as reject', async () => {
    const { requests, replies } = harness()
    requests.track('per_1')
    await expect(
      requests.answer('request:per_1', { kind: 'option', optionId: 'maybe' }, async () => {}, true)
    ).rejects.toBeInstanceOf(AgentSessionPromptAnswerRejectedError)
    // The refused answer released its claim; a dismissal still denies.
    await requests.answer('request:per_1', null, async () => {}, false)
    expect(replies).toEqual([{ requestID: 'per_1', decision: 'reject' }])
  })

  it('reconciles a permission.replied elsewhere by dropping the pending card', async () => {
    const { requests } = harness()
    requests.track('per_1')
    requests.replied('per_1')
    await expect(
      requests.answer('request:per_1', { kind: 'option', optionId: 'once' }, async () => {}, true)
    ).rejects.toBeInstanceOf(AgentSessionPromptUnavailableError)
  })

  it('withdraws open cards on cancel, replying only when asked', async () => {
    const { requests, replies, applied } = harness()
    requests.track('per_1')
    requests.cancelAll(false)
    expect(applied.flat()).toEqual([{ type: 'request.withdrawn', request: 'per_1' }])
    expect(replies).toEqual([])
    requests.track('per_2')
    requests.cancelAll(true)
    expect(replies).toEqual([{ requestID: 'per_2', decision: 'reject' }])
  })

  it('releases the claim when the commit fails so a retry can answer', async () => {
    const { requests, replies } = harness()
    requests.track('per_1')
    await expect(
      requests.answer(
        'request:per_1',
        { kind: 'option', optionId: 'once' },
        async () => {
          throw new Error('journal busy')
        },
        true
      )
    ).rejects.toThrow('journal busy')
    expect(replies).toEqual([])
    await requests.answer(
      'request:per_1',
      { kind: 'option', optionId: 'once' },
      async () => {},
      true
    )
    expect(replies).toEqual([{ requestID: 'per_1', decision: 'once' }])
  })

  it('answers an unknown row with unavailable', async () => {
    const { requests } = harness()
    const answer = vi.fn()
    await expect(requests.answer('request:missing', null, answer, true)).rejects.toBeInstanceOf(
      AgentSessionPromptUnavailableError
    )
  })
})
