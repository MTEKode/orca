import { describe, expect, it } from 'vitest'
import { getRepositoryPaneSearchEntries } from './repository-search'

describe('language server settings search', () => {
  it('lets "ruby-lsp" find the repository pane', () => {
    const repo = { id: 'r', path: '/repo', displayName: 'repo', badgeColor: '#000000', addedAt: 0 }
    const entries = getRepositoryPaneSearchEntries(repo, { isLocalWindowsProject: false })
    expect(entries.some((entry) => entry.keywords?.includes('ruby-lsp'))).toBe(true)
  })
})
