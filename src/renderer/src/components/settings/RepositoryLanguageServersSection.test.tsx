// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import { resetLspClients } from '@/lib/lsp/lsp-session-opener'
import { RepositoryLanguageServersSection } from './RepositoryLanguageServersSection'

vi.mock('@/lib/lsp/lsp-session-opener', () => ({ resetLspClients: vi.fn() }))
vi.mock('../onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: (props: {
    command: string
    prepareCommandForShell: (command: string, shell: string | undefined) => string
  }) => (
    <pre data-testid="install-terminal">
      {props.prepareCommandForShell(props.command, '/bin/zsh')}
    </pre>
  )
}))

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
    await waitFor(() => expect(resetLspClients).toHaveBeenCalledTimes(1))
  })

  it('keeps existing command and ruby flags when toggling TypeScript', () => {
    const updateRepo = vi.fn(async () => true)
    const withSettings: Repo = {
      ...repo,
      languageServers: {
        enabled: { 'ruby-lsp': true },
        command: { 'ruby-lsp': ['bundle', 'exec', 'ruby-lsp'] }
      }
    }
    render(
      <RepositoryLanguageServersSection repo={withSettings} updateRepo={updateRepo} forceVisible />
    )
    fireEvent.click(screen.getByRole('switch', { name: /typescript/i }))
    expect(updateRepo).toHaveBeenCalledWith('r', {
      languageServers: {
        enabled: { 'ruby-lsp': true, typescript: true },
        command: { 'ruby-lsp': ['bundle', 'exec', 'ruby-lsp'] }
      }
    })
  })

  it('does not reset clients when the update fails', async () => {
    vi.mocked(resetLspClients).mockClear()
    const updateRepo = vi.fn(async () => false)
    render(<RepositoryLanguageServersSection repo={repo} updateRepo={updateRepo} forceVisible />)
    fireEvent.click(screen.getByRole('switch', { name: /typescript/i }))
    await Promise.resolve()
    await Promise.resolve()
    expect(resetLspClients).not.toHaveBeenCalled()
  })

  it('shows Not installed for a missing enabled Ruby server', async () => {
    const enabled: Repo = { ...repo, languageServers: { enabled: { solargraph: true } } }
    render(<RepositoryLanguageServersSection repo={enabled} updateRepo={vi.fn()} forceVisible />)
    expect(await screen.findByText('Not installed')).toBeTruthy()
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

  it('runs the install command from the project directory', async () => {
    window.api.lsp.probe = vi.fn(async () => ({ 'ruby-lsp': { status: 'missing' as const } }))
    render(
      <RepositoryLanguageServersSection
        repo={{ ...repo, languageServers: { enabled: { 'ruby-lsp': true } } }}
        updateRepo={vi.fn()}
        forceVisible
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: /install/i }))
    expect(screen.getByTestId('install-terminal').textContent).toBe(
      "cd -- '/repo' && gem install ruby-lsp"
    )
  })

  it('saves a custom command as argv', async () => {
    const updateRepo = vi.fn(async () => true)
    render(
      <RepositoryLanguageServersSection
        repo={{ ...repo, languageServers: { enabled: { 'ruby-lsp': true } } }}
        updateRepo={updateRepo}
        forceVisible
      />
    )
    const input = screen.getByLabelText(/custom command/i)
    fireEvent.change(input, { target: { value: 'bundle exec ruby-lsp' } })
    fireEvent.blur(input)
    expect(updateRepo).toHaveBeenCalledWith('r', {
      languageServers: {
        enabled: { 'ruby-lsp': true },
        command: { 'ruby-lsp': ['bundle', 'exec', 'ruby-lsp'] }
      }
    })
    await waitFor(() => expect(resetLspClients).toHaveBeenCalled())
  })
})
