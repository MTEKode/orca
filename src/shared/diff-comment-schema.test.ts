import { describe, expect, it } from 'vitest'
import { DiffCommentSchema } from './diff-comment-schema'

const BASE = {
  id: 'c1',
  worktreeId: 'repo-1::/w',
  filePath: 'src/a.ts',
  lineNumber: 4,
  body: 'note',
  createdAt: 1,
  side: 'modified'
} as const

describe('DiffCommentSchema author', () => {
  it('round-trips both authors and leaves an absent one undefined', () => {
    expect(DiffCommentSchema.parse({ ...BASE, author: 'agent' }).author).toBe('agent')
    expect(DiffCommentSchema.parse({ ...BASE, author: 'user' }).author).toBe('user')
    expect(DiffCommentSchema.parse({ ...BASE }).author).toBeUndefined()
  })

  it('rejects an unknown author', () => {
    expect(DiffCommentSchema.safeParse({ ...BASE, author: 'github' }).success).toBe(false)
  })
})
