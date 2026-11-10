// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionOptionDescriptor } from '../../../../shared/native-chat/input/native-chat-session-options'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    Object.entries(values ?? {}).reduce(
      (text, [name, value]) => text.replaceAll(`{{${name}}}`, value),
      fallback
    )
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
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

import { NativeChatSessionOptionPickers } from './session/options/controls/NativeChatSessionOptionPickers'

const surface = {
  getSnapshot: vi.fn(() => []),
  setOption: vi.fn(),
  invokeAction: vi.fn(),
  subscribe: vi.fn(() => vi.fn())
}

const select = (
  id: string,
  category: NonNullable<SessionOptionDescriptor['category']>,
  currentValue: string,
  choices: { value: string; label: string }[]
): SessionOptionDescriptor => ({
  id,
  label: id,
  category,
  kind: { type: 'select', currentValue, choices },
  valueSource: 'applied',
  transport: 'catalog',
  settable: true
})

const picks = (model: string, effort: string): SessionOptionDescriptor[] => [
  select('model', 'model', model, [
    { value: 'opus', label: 'Opus 4.8' },
    { value: 'sonnet', label: 'Sonnet 5' }
  ]),
  select('effort', 'thought_level', effort, [
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' }
  ])
]

afterEach(() => cleanup())

describe('NativeChatSessionOptionPickers agent label', () => {
  it('reads "Agent: Harness · model · effort" and follows live picks', () => {
    const { rerender } = render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={picks('opus', 'high')}
        isWorking={false}
        agent="claude"
      />
    )
    expect(screen.getByRole('button', { name: /^Model Agent: Claude/ }).textContent).toBe(
      'Agent: Claude · Opus 4.8 · High'
    )

    rerender(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={picks('sonnet', 'low')}
        isWorking={false}
        agent="claude"
      />
    )
    expect(screen.getByRole('button', { name: /^Model Agent: Claude/ }).textContent).toBe(
      'Agent: Claude · Sonnet 5 · Low'
    )
  })

  it('reads "Orchestrator: …" in its own group when the chat has a pinned worker', () => {
    render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={picks('opus', 'high')}
        isWorking={false}
        agent="claude"
        mteWorker={{ agent: 'codex', model: 'gpt-5', effort: 'low' }}
      />
    )
    expect(screen.getByRole('button', { name: /^Model Orchestrator:/ }).textContent).toBe(
      'Orchestrator: Claude · Opus 4.8 · High'
    )
    expect(screen.getByRole('group', { name: 'Orchestrator' })).toBeTruthy()
  })

  it('keeps the model · effort pill when no agent is given', () => {
    render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={picks('opus', 'high')}
        isWorking={false}
      />
    )
    expect(screen.getByRole('button', { name: /^Model Opus 4.8/ }).textContent).toBe('Opus 4.8High')
  })
})
