// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { TooltipProvider } from '../ui/tooltip'
import {
  NativeChatTranscriptRow,
  type NativeChatTranscriptRowContext
} from './messages/rows/NativeChatTranscriptRow'
import {
  buildNativeChatTranscriptSlots,
  type NativeChatTranscriptSlot
} from './conversation/slots/native-chat-transcript-slots'

afterEach(cleanup)

const prompt: NativeChatMessage = {
  id: 'u',
  role: 'user',
  blocks: [{ type: 'text', text: 'do the work' }],
  timestamp: 1,
  source: 'transcript'
}
const reply: NativeChatMessage = {
  id: 'a',
  role: 'assistant',
  blocks: [{ type: 'text', text: 'done' }],
  timestamp: 2,
  source: 'transcript'
}

/** A settled turn's first row carries the status bar where the revert affordance lives. */
function settledTurnSlot(): NativeChatTranscriptSlot {
  const messages = [prompt, reply]
  const slots = buildNativeChatTranscriptSlots({
    messages,
    turnKeys: messages.map(() => 'u'),
    liveTurnKey: undefined,
    receipts: new Map(),
    turnStatuses: {
      active: null,
      completedByTurn: { u: { startedAt: 1, thinking: false, workedSeconds: 5 } }
    },
    turnDiffs: new Map(),
    expandedTurnKeys: new Set(),
    isWorking: false,
    lifecycleWorking: false
  })
  const slot = slots.find(
    (candidate) => candidate.kind === 'message' && candidate.message.id === 'u'
  )
  if (!slot) {
    throw new Error('expected the turn-opening row')
  }
  return slot
}

function contextWith(
  turnRevert: NativeChatTranscriptRowContext['turnRevert']
): NativeChatTranscriptRowContext {
  return {
    expandSignal: false,
    revealedDiff: null,
    taskListPredecessors: new Map(),
    expandedTurnIds: new Set(),
    onToggleExpandedTurn: () => {},
    subagentDisclosure: { setSectionOpen: () => {}, setRosterOpen: () => {} },
    onScrollMessageToTop: () => {},
    onRevealDiff: () => {},
    ...(turnRevert ? { turnRevert } : {})
  }
}

describe('the turn row revert affordance', () => {
  it('offers revert only when the turn has a start checkpoint', () => {
    const requestRevert = vi.fn()
    const { rerender } = render(
      <NativeChatTranscriptRow
        slot={settledTurnSlot()}
        context={contextWith({ hasStartCheckpoint: () => true, requestRevert })}
      />,
      { wrapper: TooltipProvider }
    )
    const button = screen.getByRole('button', { name: 'Revert to before this turn' })
    fireEvent.click(button)
    expect(requestRevert).toHaveBeenCalledWith('u')

    rerender(
      <NativeChatTranscriptRow
        slot={settledTurnSlot()}
        context={contextWith({ hasStartCheckpoint: () => false, requestRevert })}
      />
    )
    expect(screen.queryByRole('button', { name: 'Revert to before this turn' })).toBeNull()
  })

  it('shows no revert affordance without a checkpoint surface', () => {
    render(<NativeChatTranscriptRow slot={settledTurnSlot()} context={contextWith(undefined)} />, {
      wrapper: TooltipProvider
    })
    expect(screen.queryByRole('button', { name: 'Revert to before this turn' })).toBeNull()
  })
})
