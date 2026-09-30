// src/renderer/src/lib/lsp/lsp-location-models.test.ts
import { describe, expect, it, vi } from 'vitest'
import { URI } from 'monaco-editor/esm/vs/base/common/uri.js'
import {
  LSP_PEEK_SCHEME,
  MAX_LOCATION_FILES,
  resolveLocationModels,
  type LocationModelMonaco
} from './lsp-location-models'

function fakeMonaco(existing: string[] = []): LocationModelMonaco<URI> & { created: string[] } {
  const created: string[] = []
  const models = new Map<string, { isAttachedToEditor: () => boolean; dispose: () => void }>()
  for (const uri of existing) {
    models.set(uri, { isAttachedToEditor: () => true, dispose: vi.fn() })
  }
  return {
    created,
    Uri: URI,
    editor: {
      getModel: (uri) => models.get(uri.toString()) ?? null,
      createModel: (_value, _language, uri) => {
        created.push(uri.toString())
        const model = { isAttachedToEditor: () => false, dispose: vi.fn() }
        models.set(uri.toString(), model)
        return model
      }
    }
  }
}
const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }

describe('resolveLocationModels', () => {
  it('reuses an open file model even when the server spells the URI differently', async () => {
    // Why forward slashes: URI.file only rewrites backslashes on Windows hosts, and tests run everywhere.
    const monaco = fakeMonaco([URI.file('C:/src/a.ts').toString()])
    const readFile = vi.fn()
    const result = await resolveLocationModels(
      monaco,
      [{ uri: 'file:///C:/src/a.ts', range }],
      readFile
    )
    expect(result[0].uri.toString()).toBe(URI.file('C:/src/a.ts').toString())
    expect(readFile).not.toHaveBeenCalled()
  })

  it('creates read-only peek models for unopened files and drops unreadable ones', async () => {
    const monaco = fakeMonaco()
    const readFile = vi.fn(async (path: string) =>
      path.endsWith('bin.dat') ? { content: '', isBinary: true } : { content: 'x', isBinary: false }
    )
    const result = await resolveLocationModels(
      monaco,
      [
        { uri: 'file:///repo/b.rb', range },
        { uri: 'file:///repo/bin.dat', range }
      ],
      readFile
    )
    expect(result).toHaveLength(1)
    expect(result[0].uri.scheme).toBe(LSP_PEEK_SCHEME)
  })

  it('reads at most MAX_LOCATION_FILES distinct files', async () => {
    const monaco = fakeMonaco()
    const readFile = vi.fn(async () => ({ content: 'x', isBinary: false }))
    const locations = Array.from({ length: MAX_LOCATION_FILES + 50 }, (_, i) => ({
      uri: `file:///repo/f${i}.rb`,
      range
    }))
    const result = await resolveLocationModels(monaco, locations, readFile)
    expect(readFile).toHaveBeenCalledTimes(MAX_LOCATION_FILES)
    expect(result).toHaveLength(MAX_LOCATION_FILES)
  })
})
