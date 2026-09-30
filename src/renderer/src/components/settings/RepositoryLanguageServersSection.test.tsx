// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import { RepositoryLanguageServersSection } from './RepositoryLanguageServersSection'

vi.mock('@/lib/lsp/lsp-session-opener', () => ({ resetLspClients: vi.fn() }))

const repo: Repo = {
  id: 'r',
  path: '/repo',
  displayName: 'repo',
  badgeColor: '#000000',
  addedAt: 0
}

describe('RepositoryLanguageServersSection', () => {
  beforeEach(() => {
    Object.assign(window, {
      api: {
        lsp: {
          probe: vi.fn(async () => ({
            typescript: { status: 'bundled' },
            'ruby-lsp': { status: 'installed', version: '0.26.1' },
            solargraph: { status: 'missing' }
          }))
        }
      }
    })
  })
  afterEach(cleanup)

  it('enables the TypeScript server for this project only', async () => {
    const updateRepo = vi.fn(async () => true)
    render(<RepositoryLanguageServersSection repo={repo} updateRepo={updateRepo} forceVisible />)
    fireEvent.click(screen.getByRole('switch', { name: /typescript/i }))
    expect(updateRepo).toHaveBeenCalledWith('r', {
      languageServers: { enabled: { typescript: true } }
    })
  })

  it('disables controls for remote projects', async () => {
    render(
      <RepositoryLanguageServersSection
        repo={{ ...repo, connectionId: 'ssh-1' }}
        updateRepo={vi.fn()}
        forceVisible
      />
    )
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /typescript/i }).hasAttribute('disabled')).toBe(
        true
      )
    )
  })
})
