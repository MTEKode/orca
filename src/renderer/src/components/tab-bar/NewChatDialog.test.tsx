// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, getByText, queryByText } from '@testing-library/react'
import { Dialog } from '@/components/ui/dialog'
import type { AgentPickerEntry } from '../../../../shared/agent-launch-picker'
import type { NewChatRequest } from './new-chat-dialog-store'
import { NewChatDialogForm, newChatCatalogIsFallback } from './NewChatDialog'

vi.mock('sonner', () => ({ toast: { message: vi.fn(), error: vi.fn() } }))

function pickerEntry(
  agent: AgentPickerEntry['agent'],
  label: string,
  efforts: string[] = ['low', 'medium', 'high']
): AgentPickerEntry {
  return {
    agent,
    label,
    rows: [{ agent, kind: 'chat' }],
    surfaces: ['chat'],
    defaultSurface: 'chat',
    terminal: {},
    structured: {},
    catalog: {
      origin: 'probe',
      fetchedAt: 1,
      models: [
        {
          id: `${agent}-large`,
          label: `${label} Large`,
          isDefault: true,
          defaultEffort: 'medium',
          efforts: efforts.map((value) => ({ value, label: value.toUpperCase() }))
        }
      ]
    }
  }
}

const entries = [
  pickerEntry('claude', 'Claude'),
  pickerEntry('opencode', 'OpenCode'),
  pickerEntry('gemini', 'Gemini')
]

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const request: NewChatRequest = {
  worktreeId: 'repo1::/tmp/wt',
  linkedItems: [],
  orchestrationAvailable: true,
  defaults: {
    orchestration: false,
    chat: { agent: 'claude', model: 'claude-large', effort: 'high' }
  }
}

function render(onSettle = vi.fn(), overrides: Partial<NewChatRequest> = {}): void {
  act(() =>
    root.render(
      <Dialog open>
        <NewChatDialogForm
          request={{ ...request, ...overrides }}
          entries={entries}
          onSettle={onSettle}
        />
      </Dialog>
    )
  )
}

describe('NewChatDialogForm', () => {
  it('offers one harness/model pick with the effort select of the chosen model', () => {
    render()
    expect(document.body.querySelector('#new-chat-model')).not.toBeNull()
    expect(document.body.querySelector('#new-chat-effort')).not.toBeNull()
    expect(queryByText(document.body, 'Orchestration mode')).not.toBeNull()
    expect(queryByText(document.body, 'Orchestrator')).toBeNull()
  })

  it('hides the orchestration choice when the repo cannot orchestrate', () => {
    render(vi.fn(), { orchestrationAvailable: false })
    expect(queryByText(document.body, 'Orchestration mode')).toBeNull()
    expect(document.body.querySelector('#new-chat-model')).not.toBeNull()
  })

  it('shows the orchestrator and worker blocks, limited to orchestration agents', () => {
    render()
    act(() => {
      fireEvent.click(document.body.querySelector('[role="checkbox"]')!)
    })
    expect(getByText(document.body, 'Orchestrator')).not.toBeUndefined()
    expect(getByText(document.body, 'Worker')).not.toBeUndefined()
    expect(document.body.querySelector('#new-chat-goal')).not.toBeNull()
    expect(queryByText(document.body, 'Gemini Large')).toBeNull()
  })

  it('keeps Start enabled on a fallback catalog and says the list may be incomplete', () => {
    render(vi.fn(), {
      defaults: undefined
    })
    expect(newChatCatalogIsFallback(entries)).toBe(false)
    const start = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === 'Start'
    )
    expect(start?.disabled).toBe(false)
    expect(queryByText(document.body, 'Model list may be incomplete')).toBeNull()
  })

  it('settles the chat choice with the picked model and effort', () => {
    const onSettle = vi.fn()
    render(onSettle)
    act(() => {
      ;[...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Start')!.click()
    })
    expect(onSettle).toHaveBeenCalledWith({
      mode: 'chat',
      chat: {
        agent: 'claude',
        model: 'claude-large',
        effort: 'high',
        entry: entries[0]
      },
      defaults: {
        orchestration: false,
        chat: { agent: 'claude', model: 'claude-large', effort: 'high' }
      }
    })
  })

  it('settles an orchestration choice carrying the pinned worker', () => {
    const onSettle = vi.fn()
    render(onSettle)
    act(() => {
      fireEvent.click(document.body.querySelector('[role="checkbox"]')!)
    })
    act(() => {
      ;[...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Start')!.click()
    })
    const choice = onSettle.mock.calls[0][0]
    expect(choice.mode).toBe('mte')
    expect(choice.worker).toEqual({
      agent: 'claude',
      model: 'claude-large',
      effort: 'medium'
    })
    expect(choice.orchestrator).toMatchObject({ agent: 'claude', model: 'claude-large' })
  })
})
