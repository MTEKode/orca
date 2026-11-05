// @vitest-environment happy-dom
import * as React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentPickerEntry } from '../../../../shared/agent-launch/picker/agent-launch-picker'

vi.mock('@/i18n/i18n', () => ({
  translate: (_k: string, fallback: string) => fallback,
  i18n: { language: 'en' }
}))
vi.mock('@/components/ui/button', () => ({
  Button: React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ children, ...p }, ref) => (
      <button ref={ref} {...p}>
        {children}
      </button>
    )
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

const inventorySourceSpy = vi.fn()
const mockEntries: AgentPickerEntry[] = [
  {
    agent: 'claude',
    label: 'Claude',
    rows: [{ agent: 'claude', kind: 'chat' }],
    surfaces: ['chat'],
    defaultSurface: 'chat',
    terminal: {},
    structured: {},
    catalog: {
      origin: 'probe',
      fetchedAt: 1,
      models: [
        {
          id: 'sonnet',
          label: 'Claude Sonnet',
          isDefault: true,
          efforts: [{ value: 'high', label: 'High' }]
        }
      ]
    }
  },
  {
    agent: 'opencode',
    label: 'OpenCode',
    rows: [{ agent: 'opencode', kind: 'chat' }],
    surfaces: ['chat'],
    defaultSurface: 'chat',
    terminal: {},
    structured: {},
    catalogRead: 'pending',
    catalog: { origin: 'unknown' }
  }
]

vi.mock('@/components/agent/use-agent-launch-picker-inventory', () => ({
  useAgentLaunchPickerInventorySource: (...args: unknown[]) => {
    inventorySourceSpy(...args)
    return {}
  },
  useAgentPickerInventoryEntries: () => mockEntries
}))

import { NativeChatMteWorkerPicker } from './NativeChatMteWorkerPicker'

afterEach(() => {
  cleanup()
  inventorySourceSpy.mockClear()
})

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
    expect(document.querySelector('#composer-mte-worker-model')).toBeTruthy()
  })

  it('renders Harness -> Model submenu and allows selecting a pending harness with models: []', () => {
    const onChange = vi.fn()
    render(
      <NativeChatMteWorkerPicker
        worker={{ agent: 'claude', model: 'sonnet' }}
        worktreeId="w1"
        onChange={onChange}
      />
    )

    const trigger = document.querySelector('#composer-mte-worker-model')!
    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse', ctrlKey: false })

    const opencodeSubTrigger = [...document.body.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes('OpenCode')
    )
    expect(opencodeSubTrigger).not.toBeUndefined()

    fireEvent.focus(opencodeSubTrigger!)
    expect(inventorySourceSpy).toHaveBeenLastCalledWith('w1', expect.anything(), true, 'opencode')

    fireEvent.click(opencodeSubTrigger!)
    expect(screen.getByText('Loading models…')).toBeTruthy()

    const opencodeItem = [...document.body.querySelectorAll('[role="menuitem"]')].find(
      (el) => el !== opencodeSubTrigger && el.textContent?.trim() === 'OpenCode'
    )
    expect(opencodeItem).not.toBeUndefined()
    fireEvent.click(opencodeItem!)

    expect(onChange).toHaveBeenCalledWith({ agent: 'opencode' })
  })
})
