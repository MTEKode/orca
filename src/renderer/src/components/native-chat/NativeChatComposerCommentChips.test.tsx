// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatComposerCommentChips } from './NativeChatComposerCommentChips'

const deleteDiffComment = vi.fn()
const owner = vi.hoisted(() => ({ kind: 'folder', worktreeId: 'w1' }))
const comments = [
  { id: '1', filePath: 'a/App.swift', lineNumber: 39, startLine: 35, body: 'x' },
  { id: '2', filePath: 'b/Other.ts', lineNumber: 7, body: 'y' },
  { id: '3', filePath: 'c/Sent.ts', lineNumber: 1, body: 'z', sentAt: 5 }
]

vi.mock('./use-native-chat-queued-diff-comments', () => ({
  useNativeChatQueuedDiffComments: () => comments.filter((c) => !('sentAt' in c))
}))
vi.mock('@/components/diff-comments/use-diff-comment-owner', () => ({
  useDiffCommentView: () => ({ owner, comments: undefined })
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector({ deleteDiffComment })
}))

describe('NativeChatComposerCommentChips', () => {
  afterEach(cleanup)

  it('renders one chip per unsent comment and removes on click', () => {
    const view = render(<NativeChatComposerCommentChips worktreeId="w1" />)
    expect(view.getAllByRole('button')).toHaveLength(2)
    expect(view.getByText('App.swift +35-39')).toBeDefined()
    expect(view.getByText('Other.ts +7')).toBeDefined()
    fireEvent.click(view.getByRole('button', { name: /a\/App.swift lines 35-39/ }))
    expect(deleteDiffComment).toHaveBeenCalledWith(owner, '1')
  })
})
