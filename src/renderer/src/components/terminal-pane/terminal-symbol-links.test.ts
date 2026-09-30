import type { ILink, Terminal } from '@xterm/xterm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  lookupWorkspaceSymbol: vi.fn(),
  openDetectedFilePath: vi.fn(),
  toast: vi.fn(),
  isMac: true
}))

vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/lib/lsp/lsp-workspace-symbol-lookup', () => ({
  lookupWorkspaceSymbol: mocks.lookupWorkspaceSymbol
}))
vi.mock('./terminal-file-open-routing', () => ({
  openDetectedFilePath: mocks.openDetectedFilePath
}))
vi.mock('./terminal-link-open-hints', () => ({ isMacPlatform: () => mocks.isMac }))
vi.mock('./wrapped-terminal-link-ranges', () => ({
  buildWrappedLogicalLine: (_buffer: unknown, _line: number) => ({ text: 'raise Greeter here' }),
  rangeForParsedFileLink: (_line: unknown, start: number, end: number) => ({
    start: { x: start + 1, y: 1 },
    end: { x: end, y: 1 }
  })
}))

import { createTerminalSymbolLinkProvider, extractSymbolTokens } from './terminal-symbol-links'

describe('extractSymbolTokens', () => {
  it('finds qualified identifiers with exclusive end indexes', () => {
    const line = 'NoMethodError: undefined method `total` for Billing::Invoice#charge!'
    const tokens = extractSymbolTokens(line)
    expect(tokens.map((t) => t.text)).toEqual([
      'NoMethodError',
      'undefined',
      'method',
      'total',
      'Billing::Invoice#charge!'
    ])
    const invoice = tokens.at(-1)
    expect(line.slice(invoice?.startIndex, invoice?.endIndex)).toBe('Billing::Invoice#charge!')
  })

  it('skips short tokens and numbers', () => {
    expect(extractSymbolTokens('at 12 go for the x1').map((t) => t.text)).toEqual([])
  })
})

function fakeTerminal(): Terminal {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the provider only reads buffer.active and calls clearSelection.
  return { buffer: { active: {} }, clearSelection: vi.fn() } as unknown as Terminal
}

function provideLinks(isLspEnabled: boolean): ILink[] | undefined {
  const terminal = fakeTerminal()
  const provider = createTerminalSymbolLinkProvider({
    getTerminal: () => terminal,
    worktreeId: 'repo::/work/app',
    worktreePath: '/work/app',
    isLspEnabled: () => isLspEnabled
  })
  let links: ILink[] | undefined
  provider.provideLinks(1, (result) => {
    links = result
  })
  return links
}

function greeterLink(): ILink {
  const link = provideLinks(true)?.find((candidate) => candidate.text === 'Greeter')
  if (!link) {
    throw new Error('expected a Greeter link')
  }
  return link
}

function click(metaKey: boolean): MouseEvent {
  // Why: the test env has no DOM; activate only reads modifiers and calls preventDefault.
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: activate only reads button, modifiers and preventDefault.
  return { metaKey, ctrlKey: false, button: 0, preventDefault: vi.fn() } as unknown as MouseEvent
}

describe('createTerminalSymbolLinkProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isMac = true
  })

  it('provides no links when no language server is enabled', () => {
    expect(provideLinks(false)).toBeUndefined()
    expect(mocks.lookupWorkspaceSymbol).not.toHaveBeenCalled()
  })

  it('ignores activation without the platform modifier', () => {
    greeterLink().activate(click(false), 'Greeter')
    expect(mocks.lookupWorkspaceSymbol).not.toHaveBeenCalled()
  })

  it('opens the top-ranked definition with 1-based line and column on modifier click', async () => {
    mocks.lookupWorkspaceSymbol.mockResolvedValue([
      {
        name: 'Greeter',
        kind: 5,
        containerName: null,
        uri: 'file:///work/app/lib/greeter.rb',
        line: 0,
        character: 6
      }
    ])
    greeterLink().activate(click(true), 'Greeter')
    await vi.waitFor(() => expect(mocks.openDetectedFilePath).toHaveBeenCalled())
    expect(mocks.openDetectedFilePath).toHaveBeenCalledWith(
      '/work/app/lib/greeter.rb',
      1,
      7,
      expect.objectContaining({ worktreeId: 'repo::/work/app', worktreePath: '/work/app' })
    )
  })

  it('shows a toast when no definition matches', async () => {
    mocks.lookupWorkspaceSymbol.mockResolvedValue([])
    greeterLink().activate(click(true), 'Greeter')
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalled())
    expect(mocks.openDetectedFilePath).not.toHaveBeenCalled()
  })
})
