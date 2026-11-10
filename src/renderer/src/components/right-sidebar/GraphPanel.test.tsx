// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
  state: {} as Record<string, unknown>,
  build: vi.fn(async () => {}),
  update: vi.fn(async () => {}),
  cancel: vi.fn(async () => {})
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign((sel?: (s: unknown) => unknown) => (sel ? sel(h.state) : h.state), {
    getState: () => h.state
  })
}))
vi.mock('@/store/repos/use-repository-catalog', () => ({ useActiveRepo: () => ({ id: 'r1' }) }))
vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc: vi.fn() }))
vi.mock('@/components/terminal-pane/links/files/terminal-html-file-browser-open', () => ({
  openHtmlFileInBrowser: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
import GraphPanel from './GraphPanel'

let root: Root | null = null
let host: HTMLElement | null = null
const mount = async (el: React.JSX.Element): Promise<HTMLElement> => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(el))
  return host
}
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
const q = (sel: string): HTMLElement => host!.querySelector(sel) as HTMLElement
const btn = (text: string): HTMLButtonElement =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
  [...host!.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text
  ) as HTMLButtonElement
const click = async (el: HTMLElement): Promise<void> => {
  await act(async () => el.click())
}
const cleanup = (): void => {
  act(() => root?.unmount())
  host?.remove()
}

const setStatus = (status: Record<string, unknown> | undefined, log: string[] = []): void => {
  h.state = {
    activeWorktreeId: 'w1',
    graphifyByRepo: status ? { r1: status } : {},
    graphifyLogByRepo: { r1: log },
    refreshGraphify: vi.fn(async () => {}),
    buildGraphify: h.build,
    updateGraphify: h.update,
    cancelGraphify: h.cancel
  }
}
const built = {
  state: 'built',
  builtAt: Date.now(),
  nodeCount: 5,
  edgeCount: 7,
  semantic: true,
  running: null
}

describe('GraphPanel', () => {
  afterEach(cleanup)

  it('missing: shows empty state, Update disabled', async () => {
    setStatus({ ...built, state: 'missing', builtAt: null })
    await mount(<GraphPanel />)
    expect(host!.textContent).toContain('No graph yet')
    expect(btn('Update').disabled).toBe(true)
  })

  it('built: shows counts; Build passes deep flag', async () => {
    setStatus(built)
    await mount(<GraphPanel />)
    expect(host!.textContent).toMatch(/5 nodes · 7 edges · semantic yes/)
    await click(q('[role="checkbox"]'))
    await click(btn('Build'))
    expect(h.build).toHaveBeenCalledWith('r1', true)
  })

  it('building: shows log tail and Cancel', async () => {
    setStatus({ ...built, running: 'build' }, ['step one'])
    await mount(<GraphPanel />)
    expect(host!.textContent).toContain('Building…')
    expect(host!.textContent).toContain('step one')
    await click(btn('Cancel'))
    expect(h.cancel).toHaveBeenCalledWith('r1')
  })

  it('updating: shows updating state and the uv hint on error', async () => {
    setStatus({ ...built, running: 'update', error: 'uv not found' })
    await mount(<GraphPanel />)
    expect(host!.textContent).toContain('Updating…')
    expect(host!.textContent).toContain('uv not found')
  })
})
