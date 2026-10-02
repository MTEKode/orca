import { describe, expect, it, vi } from 'vitest'
import type * as Monaco from 'monaco-editor'
import { defineOrcaMonacoThemes, orcaMonacoTheme } from './monaco-orca-themes'

describe('orca Monaco themes', () => {
  it('names one theme per color scheme', () => {
    expect(orcaMonacoTheme(false)).toBe('orca-light')
    expect(orcaMonacoTheme(true)).toBe('orca-dark')
  })

  it('defines both themes on top of the built-ins with semantic token colors', () => {
    const defineTheme = vi.fn()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only editor.defineTheme is used.
    defineOrcaMonacoThemes({ editor: { defineTheme } } as unknown as typeof Monaco)
    const themes = Object.fromEntries(defineTheme.mock.calls.map(([name, data]) => [name, data]))
    expect(themes['orca-light']).toMatchObject({ base: 'vs', inherit: true })
    expect(themes['orca-dark']).toMatchObject({ base: 'vs-dark', inherit: true })
    expect(themes['orca-light'].rules).toContainEqual({ token: 'method', foreground: '795E26' })
    expect(themes['orca-dark'].rules).toContainEqual({ token: 'namespace', foreground: '4EC9B0' })
    expect(themes['orca-dark'].rules).toContainEqual({ token: 'parameter', foreground: '9CDCFE' })
    // Why: matches the unruled root foreground of the built-in vs / vs-dark themes.
    expect(themes['orca-light'].rules).toContainEqual({
      token: 'namespace.cpp',
      foreground: '000000'
    })
    expect(themes['orca-dark'].rules).toContainEqual({
      token: 'namespace.cpp',
      foreground: 'D4D4D4'
    })
  })
})
