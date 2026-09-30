// src/renderer/src/lib/lsp/lsp-location-models.test.ts
import { describe, expect, it, vi } from 'vitest'
import { URI } from 'monaco-editor/esm/vs/base/common/uri.js'
import {
  LSP_PEEK_SCHEME,
  MAX_LOCATION_FILES,
  resolveLocationModels,
  type LocationModelMonaco
} from './lsp-location-models'

function fakeMonaco(
  existing: string[] = []
): LocationModelMonaco<URI> & { created: string[]; disposedUris: string[] } {
  const created: string[] = []
  const disposedUris: string[] = []
  const models = new Map<string, { isAttachedToEditor: () => boolean; dispose: () => void }>()
  for (const uri of existing) {
    models.set(uri, { isAttachedToEditor: () => true, dispose: vi.fn() })
  }
  return {
    created,
    disposedUris,
    Uri: URI,
    editor: {
      getModel: (uri) => models.get(uri.toString()) ?? null,
      createModel: (_value, _language, uri) => {
        created.push(uri.toString())
        let disposed = false
        const model = {
          isAttachedToEditor: () => false,
          dispose: () => {
            disposed = true
            disposedUris.push(uri.toString())
          },
          isDisposed: () => disposed
        }
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

  it('creates peek models for unopened files and drops unreadable ones', async () => {
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

  it('keeps every model of the current result alive, then prunes to the cap on the next resolve', async () => {
    const monaco = fakeMonaco()
    const readFile = vi.fn(async () => ({ content: 'x', isBinary: false }))
    const locations = Array.from({ length: 80 }, (_, i) => ({
      uri: `file:///pool/f${i}.rb`,
      range
    }))
    const first = await resolveLocationModels(monaco, locations, readFile)
    expect(first).toHaveLength(80)
    expect(monaco.disposedUris).toEqual([])

    const other = [{ uri: 'file:///other/x.rb', range }]
    await resolveLocationModels(monaco, other, readFile)
    expect(monaco.disposedUris).toHaveLength(31)
  })
})
