// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiffComment } from '../../../../../../shared/diff-comment-types'
import { DiffCommentsInlineList } from './diff-comments-list'

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

function renderList(comments: DiffComment[]) {
  return render(
    <DiffCommentsInlineList
      comments={comments}
      onDelete={vi.fn()}
      onClearFile={vi.fn()}
      onOpen={vi.fn()}
    />
  )
}

describe('DiffCommentsInlineList agent badge', () => {
  afterEach(cleanup)

  it('badges agent notes with AI and keeps their delete action', () => {
    renderList([comment('u1'), comment('a1', { author: 'agent' })])
    expect(screen.getAllByText('AI')).toHaveLength(1)
    // Both notes keep copy + delete; only the agent note carries the badge.
    expect(screen.getAllByTitle('Delete note')).toHaveLength(2)
    expect(screen.getAllByTitle('Copy note')).toHaveLength(2)
  })

  it('shows no AI badge for user notes only', () => {
    renderList([comment('u1'), comment('u2', { lineNumber: 9 })])
    expect(screen.queryByText('AI')).toBeNull()
  })
})
