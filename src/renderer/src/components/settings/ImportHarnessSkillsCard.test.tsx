// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportableSkill } from '../../../../shared/skills/importable-skill'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  updateSettings: vi.fn(),
  state: {
    settings: undefined as
      | { importedHarnessSkills?: { enabled: boolean; selected: string[] } }
      | undefined
  }
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.rpc }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ ...mocks.state, updateSettings: mocks.updateSettings })
}))

import { ImportHarnessSkillsCard } from './ImportHarnessSkillsCard'

const skills: ImportableSkill[] = [
  {
    id: 'claude-home:review',
    name: 'review',
    description: 'Reviews a change.',
    origin: 'claude-home',
    sourcePath: '/home/u/.claude/skills/review',
    state: 'available'
  },
  {
    id: 'codex:format',
    name: 'format',
    description: 'Formats code.',
    origin: 'codex',
    sourcePath: '/home/u/.codex/skills/format',
    state: 'linked'
  },
  {
    id: 'cursor:taken',
    name: 'taken',
    description: null,
    origin: 'cursor',
    sourcePath: '/home/u/.cursor/skills/taken',
    state: 'conflict'
  }
]

function enable(selected: string[] = []): void {
  mocks.state.settings = { importedHarnessSkills: { enabled: true, selected } }
}

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ skills })
  mocks.updateSettings.mockReset().mockResolvedValue(undefined)
  mocks.state.settings = { importedHarnessSkills: { enabled: false, selected: [] } }
})

afterEach(cleanup)

describe('ImportHarnessSkillsCard', () => {
  it('enables importing without touching existing links', async () => {
    const user = userEvent.setup()
    render(<ImportHarnessSkillsCard />)

    expect(screen.queryByRole('button', { name: /sync/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Import skills from other harnesses' }))

    expect(mocks.updateSettings).toHaveBeenCalledWith({
      importedHarnessSkills: { enabled: true, selected: [] }
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('syncs and groups skills by origin with conflicts disabled', async () => {
    const user = userEvent.setup()
    enable()
    render(<ImportHarnessSkillsCard />)

    await user.click(screen.getByRole('button', { name: /sync/i }))

    expect(mocks.rpc).toHaveBeenCalledWith({ kind: 'local' }, 'skills.importableList', {})
    expect(await screen.findByRole('group', { name: 'Claude home' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Codex' })).toBeInTheDocument()
    expect(screen.getByText('Reviews a change.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'format' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'taken' })).toBeDisabled()
    expect(
      screen.getByText('A different skill with this name already exists in ~/.agents/skills.')
    ).toBeInTheDocument()
  })

  it('applies the new selection when a checkbox is toggled', async () => {
    const user = userEvent.setup()
    enable(['codex:format'])
    render(<ImportHarnessSkillsCard />)
    await user.click(screen.getByRole('button', { name: /sync/i }))

    await user.click(await screen.findByRole('checkbox', { name: 'review' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith({ kind: 'local' }, 'skills.importApply', {
        selected: ['codex:format', 'claude-home:review']
      })
    )
  })

  it('reports a failed sync', async () => {
    const user = userEvent.setup()
    mocks.rpc.mockRejectedValue(new Error('discovery failed'))
    enable()
    render(<ImportHarnessSkillsCard />)

    await user.click(screen.getByRole('button', { name: /sync/i }))

    expect(await screen.findByText('discovery failed')).toBeInTheDocument()
  })
})
