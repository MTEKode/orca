import { describe, expect, it } from 'vitest'
import {
  rankWorkspaceSymbols,
  splitSymbolToken,
  toWorkspaceSymbolCandidates
} from './lsp-workspace-symbol-ranking'

const sym = (name: string, kind: number, uri: string, containerName?: string) => ({
  name,
  kind,
  containerName,
  location: { uri, range: { start: { line: 4, character: 2 }, end: { line: 4, character: 9 } } }
})

describe('splitSymbolToken', () => {
  it('splits Ruby and JS qualified names', () => {
    expect(splitSymbolToken('Billing::Invoice')).toEqual({ name: 'Invoice', container: 'Billing' })
    expect(splitSymbolToken('Invoice#total')).toEqual({ name: 'total', container: 'Invoice' })
    expect(splitSymbolToken('api.fetchUser')).toEqual({ name: 'fetchUser', container: 'api' })
    expect(splitSymbolToken('Greeter')).toEqual({ name: 'Greeter', container: null })
  })
})

describe('rankWorkspaceSymbols', () => {
  it('prefers exact names, matching containers, definitions and project files', () => {
    const candidates = toWorkspaceSymbolCandidates([
      sym('InvoiceTotal', 5, 'file:///repo/app/a.rb'),
      sym('Invoice', 5, 'file:///repo/vendor/bundle/gems/x/invoice.rb'),
      sym('Invoice', 13, 'file:///repo/app/c.rb'),
      sym('Invoice', 5, 'file:///repo/app/models/billing/invoice.rb', 'Billing')
    ])
    const ranked = rankWorkspaceSymbols('Billing::Invoice', candidates, '/repo')
    expect(ranked.map((c) => c.uri)).toEqual([
      'file:///repo/app/models/billing/invoice.rb',
      'file:///repo/app/c.rb',
      'file:///repo/vendor/bundle/gems/x/invoice.rb'
    ])
    expect(ranked[0]).toMatchObject({ line: 4, character: 2 })
  })

  it('accepts fully qualified names from ruby-lsp and range-less WorkspaceSymbol locations', () => {
    const candidates = toWorkspaceSymbolCandidates([
      { name: 'Billing::Invoice', kind: 5, location: { uri: 'file:///repo/app/invoice.rb' } }
    ])
    expect(rankWorkspaceSymbols('Invoice', candidates, '/repo')).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ line: 0, character: 0 })
  })
})
