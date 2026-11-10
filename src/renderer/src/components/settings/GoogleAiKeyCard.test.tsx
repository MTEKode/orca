// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
  state: {} as Record<string, unknown>,
  save: vi.fn(async () => {}),
  clear: vi.fn(async () => {})
}))
vi.mock('@/store', () => ({ useAppStore: (sel: (s: unknown) => unknown) => sel(h.state) }))
vi.mock('@/store/repos/use-repository-catalog', () => ({ useActiveRepo: () => ({ id: 'r1' }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
import { GoogleAiKeyCard } from './GoogleAiKeyCard'

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

const setKey = (set: boolean): void => {
  h.state = {
    graphifyGoogleAiKeySet: set,
    setGraphifyGoogleAiKey: h.save,
    clearGraphifyGoogleAiKey: h.clear
  }
}

describe('GoogleAiKeyCard', () => {
  afterEach(cleanup)

  it('never pre-fills; save sends trimmed key and clears the input', async () => {
    setKey(false)
    await mount(<GoogleAiKeyCard />)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
    const input = q('input') as HTMLInputElement
    expect(input.value).toBe('')
    expect(host!.textContent).toContain('Not set')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(input, ' secret ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(btn('Save'))
    expect(h.save).toHaveBeenCalledWith('r1', 'secret')
    expect(input.value).toBe('')
  })

  it('stored: shows status without the key and Clear calls the RPC', async () => {
    setKey(true)
    await mount(<GoogleAiKeyCard />)
    expect(host!.textContent).toContain('Key stored')
    await click(btn('Clear'))
    expect(h.clear).toHaveBeenCalledWith('r1')
  })
})
