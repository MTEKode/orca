// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({ translate: (_k: string, fallback: string) => fallback }))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...p}>{children}</button>
  )
}))
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))
vi.mock('@/hooks/useAgentDetectionTarget', () => ({
  useAgentDetectionTargetForWorktree: () => null
}))
vi.mock('../tab-bar/use-new-tab-agent-menu-rows', () => ({ useNewTabAgentMenuRows: () => ({}) }))
vi.mock('@/components/agent/use-agent-launch-picker-inventory', () => ({
  useAgentLaunchPickerInventorySource: () => ({}),
  useAgentPickerInventoryEntries: () => []
}))
vi.mock('../tab-bar/NewChatPickFields', () => ({
  NewChatPickFields: ({ onChange }: { onChange: (p: unknown) => void }) => (
    <button onClick={() => onChange({ agent: 'codex', model: 'gpt-5', effort: 'high' })}>
      pick codex
    </button>
  )
}))

import { NativeChatMteWorkerPicker } from './NativeChatMteWorkerPicker'

afterEach(() => cleanup())

describe('NativeChatMteWorkerPicker', () => {
  it('renders a labelled Worker group and reports a picked worker', () => {
    const onChange = vi.fn()
    render(
      <NativeChatMteWorkerPicker
        worker={{ agent: 'claude', model: 'sonnet' }}
        worktreeId="w1"
        onChange={onChange}
      />
    )
    expect(screen.getByRole('group', { name: 'Worker' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Worker: Claude · sonnet' })).toBeTruthy()
    fireEvent.click(screen.getByText('pick codex'))
    expect(onChange).toHaveBeenCalledWith({ agent: 'codex', model: 'gpt-5', effort: 'high' })
  })
})
