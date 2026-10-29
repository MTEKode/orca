import { describe, expect, it } from 'vitest'
import type { DiffComment } from '../../../shared/diff-comment-types'
import { composePromptWithDiffComments } from './native-chat-comment-delivery'

function comment(id: string, overrides: Partial<DiffComment> = {}): DiffComment {
  return {
    id,
    worktreeId: 'w',
    filePath: `src/${id}.ts`,
    lineNumber: 3,
    body: `note ${id}`,
    createdAt: 1,
    side: 'modified',
    ...overrides
  } as DiffComment
}

describe('composePromptWithDiffComments', () => {
  it('returns the text untouched without comments', () => {
    expect(composePromptWithDiffComments('hi', [])).toEqual({ prompt: 'hi', snapshots: [] })
  })

  it('prefixes one comment', () => {
    const { prompt, snapshots } = composePromptWithDiffComments('hi', [comment('a')])
    expect(prompt.startsWith('File: src/a.ts')).toBe(true)
    expect(prompt.endsWith('\n\nhi')).toBe(true)
    expect(snapshots.map((s) => s.id)).toEqual(['a'])
  })

  it('prefixes two comments', () => {
    const { prompt, snapshots } = composePromptWithDiffComments('hi', [
      comment('a'),
      comment('b', { startLine: 1 })
    ])
    expect(prompt.startsWith('File:')).toBe(true)
    expect(prompt.endsWith('\n\nhi')).toBe(true)
    expect(prompt).toContain('Lines: 1-3')
    expect(snapshots).toHaveLength(2)
  })

  it('sends only the prefix when the text is empty', () => {
    const { prompt } = composePromptWithDiffComments('  ', [comment('a')])
    expect(prompt.startsWith('File:')).toBe(true)
    expect(prompt.endsWith('"note a"')).toBe(true)
  })
})
