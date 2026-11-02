// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import type { DecoratedDiffComment } from './decorated-diff-comment'
import { isAgentDecoratedDiffComment } from './decorated-diff-comment'
import {
  renderDiffCommentZoneCard,
  type DiffCommentZoneCardContext
} from './diff-comment-zone-card'

function makeContext(): DiffCommentZoneCardContext {
  return {
    worktreeId: 'w1',
    filePath: 'src/a.ts',
    activeGroupId: 'w1',
    resizeZone: vi.fn(),
    onDeleteCommentRef: { current: vi.fn() },
    onUpdateCommentRef: { current: vi.fn(async () => true) },
    clearDeliveredDiffComments: vi.fn(async () => true)
  }
}

function comment(overrides: Partial<DecoratedDiffComment> = {}): DecoratedDiffComment {
  return {
    id: 'c1',
    worktreeId: 'w1',
    filePath: 'src/a.ts',
    lineNumber: 4,
    body: 'a note',
    createdAt: 1,
    side: 'modified',
    ...overrides
  }
}

describe('agent notes in diff comment zone cards', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    cleanup()
  })

  it('detects stored agent notes but not remote decorations named "agent"', () => {
    expect(isAgentDecoratedDiffComment(comment({ author: 'agent' }))).toBe(true)
    expect(
      isAgentDecoratedDiffComment(comment({ author: 'agent', url: 'https://github.com/x' }))
    ).toBe(false)
    expect(isAgentDecoratedDiffComment(comment({ author: 'octocat' }))).toBe(false)
    expect(isAgentDecoratedDiffComment(comment())).toBe(false)
  })

  it('badges an agent note and withholds remove-from-chat and edit', () => {
    act(() => renderDiffCommentZoneCard(root, comment({ author: 'agent' }), makeContext()))
    expect(container.textContent).toContain('AI')
    expect(container.textContent).not.toContain('Remove from chat')
    expect(container.textContent).not.toContain('Edit')
  })

  it('keeps remove-from-chat and edit for a user note and shows no AI badge', () => {
    act(() => renderDiffCommentZoneCard(root, comment(), makeContext()))
    expect(container.textContent).toContain('Remove from chat')
    expect(container.textContent).toContain('Edit')
    expect(container.textContent).not.toContain('AI')
  })
})
