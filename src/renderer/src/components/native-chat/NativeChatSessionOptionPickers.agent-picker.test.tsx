// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { structuredAgentSessionAgentDescriptor } from '../../../../shared/agent-session/options/structured-agent-session-agent-option'
import type { SessionOptionDescriptor } from '../../../../shared/native-chat/input/native-chat-session-options'

vi.mock('@/i18n/i18n', () => ({
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

// Keep mocked rows mounted for assertions; focus-return tests exercise real dismissal and focus.
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

afterEach(cleanup)

const model: SessionOptionDescriptor = {
  id: 'model',
  label: 'Model',
  category: 'model',
  kind: { type: 'select', currentValue: 'qwen', choices: [{ value: 'qwen', label: 'Qwen' }] },
  valueSource: 'reported',
  transport: 'agent-session',
  settable: true
}

const AGENTS = [
  { id: 'build', label: 'build', default: true },
  { id: 'plan', label: 'plan', description: 'Plans without editing' }
]

function renderPickers(snapshot: SessionOptionDescriptor[]) {
  const setOption = vi.fn(async () => ({ snapshot }))
  render(
    <NativeChatSessionOptionPickers
      surface={{
        getSnapshot: () => snapshot,
        setOption,
        invokeAction: vi.fn(),
        subscribe: vi.fn(() => vi.fn())
      }}
      snapshot={snapshot}
      isWorking={false}
    />
  )
  return setOption
}

describe('NativeChatSessionOptionPickers agent picker', () => {
  it('renders the Agent picker and writes the chosen agent under the agent key', async () => {
    const agent = structuredAgentSessionAgentDescriptor({ agents: AGENTS, currentAgent: 'build' })
    const setOption = renderPickers([model, agent as SessionOptionDescriptor])
    expect(screen.getByText('Agent')).toBeTruthy()
    screen.getByRole('radio', { name: /plan/ }).click()
    await waitFor(() => expect(setOption).toHaveBeenCalledWith('agent', 'plan'))
  })

  it('shows no Agent picker without agents', () => {
    expect(structuredAgentSessionAgentDescriptor({})).toBeNull()
    expect(structuredAgentSessionAgentDescriptor({ agents: [] })).toBeNull()
    renderPickers([model])
    expect(screen.queryByText('Agent')).toBeNull()
  })
})
