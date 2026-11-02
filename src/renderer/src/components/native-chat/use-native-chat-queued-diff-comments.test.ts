// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiffComment } from '../../../../shared/diff-comment-types'
import {
  readQueuedDiffCommentsSafely,
  useNativeChatHasQueuedDiffComments,
  useNativeChatQueuedDiffComments
} from './use-native-chat-queued-diff-comments'

const state = vi.hoisted(() => ({ comments: [] as unknown[] }))

vi.mock('@/store/worktree-diff-comments-selector', () => ({
  selectWorktreeDiffCommentsOrEmpty: () => state.comments
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector({})
}))

function comment(id: string, overrides: Partial<DiffComment> = {}): DiffComment {
  return {
    id,
    worktreeId: 'w1',
    filePath: 'src/a.ts',
    lineNumber: 4,
    body: `note ${id}`,
    createdAt: 1,
    side: 'modified',
    ...overrides
  }
}

describe('queued diff comments exclude agent notes', () => {
  it('filters agent-authored and delivered notes from the safe read', () => {
    state.comments = [
      comment('user-1'),
      comment('agent-1', { author: 'agent' }),
      comment('sent-1', { sentAt: 5 }),
      comment('agent-2', { author: 'agent', sentAt: 7 })
    ]
    expect(readQueuedDiffCommentsSafely({}, 'w1').map((c) => c.id)).toEqual(['user-1'])
  })

  it('filters agent notes from the hook the chips and counts read', () => {
    state.comments = [comment('user-1'), comment('agent-1', { author: 'agent' })]
    const { result } = renderHook(() => useNativeChatQueuedDiffComments('w1'))
    expect(result.current.map((c) => c.id)).toEqual(['user-1'])
    const has = renderHook(() => useNativeChatHasQueuedDiffComments('w1'))
    expect(has.result.current).toBe(true)
  })

  it('reports no queued comments when only agent notes exist', () => {
    state.comments = [comment('agent-1', { author: 'agent' })]
    const { result } = renderHook(() => useNativeChatQueuedDiffComments('w1'))
    expect(result.current).toEqual([])
    const has = renderHook(() => useNativeChatHasQueuedDiffComments('w1'))
    expect(has.result.current).toBe(false)
  })
})
