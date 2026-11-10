// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionOptionDescriptor } from '../../../../shared/native-chat/input/native-chat-session-options'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const mockEntries = vi.hoisted(() => ({
  current: [] as Record<string, unknown>[]
}))

vi.mock('@/hooks/useAgentDetectionTarget', () => ({
  useAgentDetectionTargetForWorktree: vi.fn(() => null)
}))

vi.mock('@/components/tab-bar/use-new-tab-agent-menu-rows', () => ({
  useNewTabAgentMenuRows: vi.fn(() => ({ state: 'settled', rows: [] }))
}))

vi.mock('@/components/agent/use-agent-launch-picker-inventory', () => ({
  useAgentLaunchPickerInventorySource: vi.fn(() => ({})),
  useAgentPickerInventoryEntries: vi.fn(() => mockEntries.current)
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({
    children,
    onPointerEnter,
    onFocus,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onPointerEnter={onPointerEnter} onFocus={onFocus} {...props}>
      {children}
    </button>
  ),
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    onSelect,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    onSelect?: (e: React.MouseEvent) => void
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e)
        onSelect?.(e)
      }}
      {...props}
    >
      {children}
    </button>
  )
}))

vi.mock('@/i18n/i18n', () => ({
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) => {
    if (!values) {
      return fallback
    }
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
      fallback
    )
  }
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

// Keep mocked rows mounted for assertions.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="picker-root" data-open={open ? 'true' : 'false'}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <div data-disabled={disabled || undefined}>{children}</div>
  ),
  PopoverContent: ({
    children,
    side,
    align,
    collisionPadding
  }: {
    children: React.ReactNode
    side?: string
    align?: string
    collisionPadding?: number
  }) => (
    <div
      data-testid="picker-content"
      data-side={side}
      data-align={align}
      data-collision-padding={collisionPadding}
    >
      {children}
    </div>
  )
}))

import { NativeChatSessionOptionPickers } from './session/options/controls/NativeChatSessionOptionPickers'

const surface = {
  getSnapshot: vi.fn(() => []),
  setOption: vi.fn(),
  invokeAction: vi.fn(),
  subscribe: vi.fn(() => vi.fn())
}

function model(overrides: Partial<SessionOptionDescriptor> = {}): SessionOptionDescriptor {
  return {
    id: 'model',
    label: 'Model',
    category: 'model',
    kind: {
      type: 'select',
      currentValue: 'opus',
      choices: [
        { value: 'opus', label: 'Opus 4.8' },
        { value: 'sonnet', label: 'Sonnet 5' }
      ]
    },
    valueSource: 'applied',
    transport: 'catalog',
    settable: true,
    ...overrides
  }
}

const EFFORT_CHOICES = [
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' }
]

const effort: SessionOptionDescriptor = {
  id: 'effort',
  label: 'Effort',
  category: 'thought_level',
  kind: { type: 'select', currentValue: 'high', choices: EFFORT_CHOICES },
  valueSource: 'applied',
  transport: 'catalog',
  settable: true
}

/** Only selects can truthfully have no current value; booleans require a baseline. */

const pill = (name: string): HTMLElement => screen.getByRole('button', { name })

afterEach(() => cleanup())

describe('NativeChatSessionOptionPickers', () => {
  it('shows concurrent model and effort picks and releases only the settled descriptor', async () => {
    let settleWrite: () => void = () => {}
    let settleModel: () => void = () => {}
    const setOption = vi.fn(
      (id: string) =>
        new Promise<{ snapshot: SessionOptionDescriptor[] }>((resolve) => {
          if (id === 'model') {
            settleModel = () => resolve({ snapshot: [] })
          } else {
            settleWrite = () => resolve({ snapshot: [] })
          }
        })
    )
    render(
      <NativeChatSessionOptionPickers
        surface={{ ...surface, setOption }}
        snapshot={[model(), effort]}
        isWorking={false}
      />
    )
    const held = (): (string | null | undefined)[] => [
      screen.getByRole('listbox').getAttribute('aria-busy'),
      screen
        .getByRole('radiogroup', { name: 'Effort' })
        .closest('[data-busy]')
        ?.getAttribute('aria-disabled')
    ]
    expect(held()).toEqual(['false', 'false'])

    screen.getByRole('radio', { name: 'Low' }).click()
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Low' }).getAttribute('aria-checked')).toBe('true')
    )
    expect(pill('Model Opus 4.8, Effort Low')).not.toBeNull()
    expect(held()).toEqual(['false', 'true'])
    screen.getByRole('option', { name: 'Sonnet 5' }).click()
    expect(setOption.mock.calls).toEqual([
      ['effort', 'low'],
      ['model', 'sonnet']
    ])
    await waitFor(() => expect(held()).toEqual(['true', 'true']))
    screen.getByRole('radio', { name: 'High' }).click()
    expect(setOption).toHaveBeenCalledTimes(2)

    // The snapshot is the truth once the write settles; here it still says High.
    await act(async () => settleWrite())
    await waitFor(() => expect(held()).toEqual(['true', 'false']))
    expect(screen.getByRole('radio', { name: 'High' }).getAttribute('aria-checked')).toBe('true')
    await act(async () => settleModel())
    await waitFor(() => expect(held()).toEqual(['false', 'false']))
  })

  it('calls onSwitchHarness when another harness and model are picked from submenu', async () => {
    const codexEntry = {
      agent: 'codex',
      label: 'Codex',
      surfaces: ['chat'],
      defaultSurface: 'chat',
      rows: [{ agent: 'codex', label: 'Codex', kind: 'chat', executionHostId: 'local' }],
      terminal: {},
      structured: {},
      catalog: {
        origin: 'host',
        status: 'settled',
        models: [
          {
            id: 'gpt-5',
            label: 'GPT-5',
            isDefault: true,
            efforts: [{ value: 'high', label: 'High' }],
            defaultEffort: 'high'
          }
        ]
      },
      catalogRead: 'settled'
    }
    const claudeEntry = {
      agent: 'claude',
      label: 'Claude',
      surfaces: ['chat'],
      defaultSurface: 'chat',
      rows: [{ agent: 'claude', label: 'Claude', kind: 'chat', executionHostId: 'local' }],
      terminal: {},
      structured: {},
      catalog: {
        origin: 'host',
        status: 'settled',
        models: [
          {
            id: 'sonnet-next',
            label: 'Sonnet Next',
            isDefault: true
          }
        ]
      },
      catalogRead: 'settled'
    }
    mockEntries.current = [claudeEntry, codexEntry]

    const onSwitchHarness = vi.fn()
    const setOption = vi.fn()

    render(
      <NativeChatSessionOptionPickers
        surface={{ ...surface, setOption }}
        snapshot={[model(), effort]}
        isWorking={false}
        agent="claude"
        worktreeId="wt-test"
        onSwitchHarness={onSwitchHarness}
      />
    )

    // Open popover by clicking pill
    pill('Model Agent: Claude · Opus 4.8 · High').click()

    expect(screen.getByText('Switch harness…')).toBeTruthy()
    expect(screen.getByText('Codex')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'GPT-5' })).toBeTruthy()

    // Pick GPT-5 from Codex (different harness)
    screen.getByRole('button', { name: 'GPT-5' }).click()

    expect(onSwitchHarness).toHaveBeenCalledWith({
      agent: 'codex',
      model: 'gpt-5',
      effort: 'high'
    })
    expect(setOption).not.toHaveBeenCalled()
  })

  it('updates model in place when picking a model from the same harness', async () => {
    const claudeEntry = {
      agent: 'claude',
      label: 'Claude',
      surfaces: ['chat'],
      defaultSurface: 'chat',
      rows: [{ agent: 'claude', label: 'Claude', kind: 'chat', executionHostId: 'local' }],
      terminal: {},
      structured: {},
      catalog: {
        origin: 'host',
        status: 'settled',
        models: [
          {
            id: 'sonnet-next',
            label: 'Sonnet Next',
            isDefault: true
          }
        ]
      },
      catalogRead: 'settled'
    }
    mockEntries.current = [claudeEntry]

    const onSwitchHarness = vi.fn()
    const setOption = vi.fn(async () => ({ snapshot: [] }))

    render(
      <NativeChatSessionOptionPickers
        surface={{ ...surface, setOption }}
        snapshot={[model(), effort]}
        isWorking={false}
        agent="claude"
        worktreeId="wt-test"
        onSwitchHarness={onSwitchHarness}
      />
    )

    pill('Model Agent: Claude · Opus 4.8 · High').click()

    // Pick Sonnet Next from Claude (same harness)
    screen.getByRole('button', { name: 'Sonnet Next' }).click()

    expect(setOption).toHaveBeenCalledWith('model', 'sonnet-next')
    expect(onSwitchHarness).not.toHaveBeenCalled()
  })
})
