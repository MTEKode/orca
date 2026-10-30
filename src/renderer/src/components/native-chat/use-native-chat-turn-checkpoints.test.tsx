// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type * as StructuredAgentClient from '@/runtime/structured-agent-session-client'
import { useNativeChatTurnCheckpoints } from './use-native-chat-turn-checkpoints'

const mocks = vi.hoisted(() => ({
  list: vi.fn()
}))
vi.mock('@/runtime/structured-agent-session-client', async (importOriginal) => ({
  ...(await importOriginal<typeof StructuredAgentClient>()),
  listStructuredAgentSessionTurnCheckpoints: mocks.list
}))

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

const TARGET = { kind: 'local' } as const

const userItem: AgentJournalRenderItem = {
  itemId: 'user-1',
  sequence: 1,
  revision: 1,
  observedAt: 1,
  body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'hi' }] }
}
const turnItem: AgentJournalRenderItem = {
  itemId: 'turn-item-1',
  sequence: 2,
  revision: 1,
  observedAt: 2,
  body: { kind: 'turn', turnId: 'turn-1', state: 'completed', userItemId: 'user-1' }
}
const ITEMS = [userItem, turnItem]

function setup(enabled = true) {
  return renderHook(() =>
    useNativeChatTurnCheckpoints({
      target: TARGET,
      sessionId: 'sess-1',
      journalItems: ITEMS,
      journalSubmissions: [],
      enabled
    })
  )
}

describe('useNativeChatTurnCheckpoints', () => {
  it('offers revert only on turns whose start checkpoint the host lists', async () => {
    mocks.list.mockResolvedValue([
      {
        turnId: 'turn-1',
        kind: 'start',
        ref: 'refs/orca-checkpoints/sess-1/turn-1/start',
        createdAt: '2026-10-30T10:00:00+01:00'
      }
    ])

    const { result } = setup()

    await waitFor(() => expect(result.current.hasStartCheckpoint('user-1')).toBe(true))
    expect(mocks.list).toHaveBeenCalledWith(TARGET, 'sess-1')
    expect(result.current.turnIdForTurnKey('user-1')).toBe('turn-1')
    expect(result.current.hasStartCheckpoint('some-other-turn')).toBe(false)
  })

  it('offers nothing when only an end checkpoint exists', async () => {
    mocks.list.mockResolvedValue([
      {
        turnId: 'turn-1',
        kind: 'end',
        ref: 'refs/orca-checkpoints/sess-1/turn-1/end',
        createdAt: '2026-10-30T10:00:00+01:00'
      }
    ])

    const { result } = setup()

    await waitFor(() => expect(mocks.list).toHaveBeenCalled())
    expect(result.current.hasStartCheckpoint('user-1')).toBe(false)
  })

  it('offers nothing when the host lacks the method', async () => {
    mocks.list.mockRejectedValue(new Error('method not found'))

    const { result } = setup()

    await waitFor(() => expect(mocks.list).toHaveBeenCalled())
    expect(result.current.hasStartCheckpoint('user-1')).toBe(false)
  })

  it('does not call the host while disabled', async () => {
    mocks.list.mockResolvedValue([])

    const { result } = setup(false)

    await waitFor(() => expect(result.current.hasStartCheckpoint('user-1')).toBe(false))
    expect(mocks.list).not.toHaveBeenCalled()
  })
})
