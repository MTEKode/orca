// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MCP_INTEGRATION_CATALOG } from '../../../../shared/mcp-integrations/catalog'
import { TooltipProvider } from '../ui/tooltip'
import { McpIntegrationCard } from './McpIntegrationCard'

type Status = {
  id: string
  connected: boolean
  method: 'oauth' | 'apiKey' | 'stdio' | null
  config?: Record<string, string>
  error: null
}
const mocks = vi.hoisted(() => ({
  statuses: new Array<Status>(),
  connect: vi.fn(async () => ({ ok: true as const })),
  save: vi.fn(async () => ({ ok: true as const })),
  saveConfig: vi.fn(async () => ({ ok: true as const })),
  disconnect: vi.fn(async () => ({ ok: true as const }))
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({
      mcpIntegrations: mocks.statuses,
      connectMcpIntegration: mocks.connect,
      setMcpIntegrationApiKey: mocks.save,
      setMcpIntegrationConfig: mocks.saveConfig,
      disconnectMcpIntegration: mocks.disconnect
    })
}))

let root: Root
let host: HTMLDivElement

function render(id: 'linear' | 'context7' | 'godot'): void {
  act(() => {
    root.render(
      <TooltipProvider>
        <McpIntegrationCard definition={MCP_INTEGRATION_CATALOG[id]} />
      </TooltipProvider>
    )
  })
}
const button = (name: string): HTMLButtonElement | undefined =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === name)

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
  mocks.statuses = []
  vi.clearAllMocks()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('McpIntegrationCard', () => {
  it('renders not connected with no Disconnect', () => {
    render('linear')
    expect(host.textContent).toContain('Not connected')
    expect(button('Disconnect')).toBeUndefined()
  })

  it('renders the OAuth and API-key connected states with Disconnect', () => {
    mocks.statuses = [{ id: 'linear', connected: true, method: 'oauth', error: null }]
    render('linear')
    expect(host.textContent).toContain('Connected via OAuth')
    expect(button('Disconnect')).toBeDefined()
    mocks.statuses = [{ id: 'linear', connected: true, method: 'apiKey', error: null }]
    render('linear')
    expect(host.textContent).toContain('Connected via API key')
  })

  it('Connect calls the store action and shows the browser hint while pending', async () => {
    let finish!: () => void
    mocks.connect.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ ok: true as const })))
    )
    render('linear')
    act(() => button('Connect')!.click())
    expect(mocks.connect).toHaveBeenCalledWith('linear')
    expect(host.textContent).toContain('Complete the sign-in in your browser')
    await act(async () => finish())
    expect(host.textContent).not.toContain('Complete the sign-in')
  })

  it('disables Save key while empty and has no Connect for API-key-only services', () => {
    render('context7')
    expect(button('Save key')!.disabled).toBe(true)
    expect(button('Connect')).toBeUndefined()
    expect(host.querySelector<HTMLInputElement>('input[type=password]')!.value).toBe('')
  })

  it('godot renders the stored plugin dir and Save instead of Connect/API key', () => {
    mocks.statuses = [
      {
        id: 'godot',
        connected: true,
        method: 'stdio',
        config: { pluginDir: '/p/gdai' },
        error: null
      }
    ]
    render('godot')
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('/p/gdai')
    expect(button('Connect')).toBeUndefined()
    expect(button('Save key')).toBeUndefined()
    act(() => button('Save')!.click())
    expect(mocks.saveConfig).toHaveBeenCalledWith('godot', { pluginDir: '/p/gdai' })
    expect(button('Disconnect')).toBeDefined()
  })
})
