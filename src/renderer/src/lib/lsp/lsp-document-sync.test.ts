import { describe, expect, it, vi } from 'vitest'
import { LspDocumentSync, lspLanguageIdForPath, type SyncModel } from './lsp-document-sync'

function model(
  uri: string,
  languageId = 'typescript',
  scheme = 'file'
): SyncModel & { change: (text: string) => void; dispose: () => void } {
  let value = 'const a = 1'
  let version = 1
  const changeListeners: (() => void)[] = []
  const disposeListeners: (() => void)[] = []
  return {
    uri: { scheme, fsPath: uri.replace('file://', ''), toString: () => uri },
    getLanguageId: () => languageId,
    getValue: () => value,
    getVersionId: () => version,
    onDidChangeContent: (listener) => {
      changeListeners.push(listener)
      return { dispose: () => {} }
    },
    onWillDispose: (listener) => {
      disposeListeners.push(listener)
      return { dispose: () => {} }
    },
    change: (text) => {
      value = text
      version++
      changeListeners.forEach((l) => l())
    },
    dispose: () => disposeListeners.forEach((l) => l())
  }
}

function fakeClient() {
  return { isClosed: false, notify: vi.fn(), request: vi.fn(), close: vi.fn() }
}

describe('LspDocumentSync', () => {
  const owner = { worktreeId: 'r::/repo', worktreePath: '/repo', repoId: 'r' }

  it('ignores diff models and files outside a worktree', () => {
    const sync = new LspDocumentSync({ findOwner: () => owner, getClient: vi.fn() })
    sync.track(model('diff:original:x', 'typescript', 'diff'))
    sync.track(model('file:///repo/a.py', 'python'))
    expect(sync.isTracked(model('diff:original:x', 'typescript', 'diff'))).toBe(false)
    const outside = new LspDocumentSync({ findOwner: () => null, getClient: vi.fn() })
    const m = model('file:///elsewhere/a.ts')
    outside.track(m)
    expect(outside.isTracked(m)).toBe(false)
  })

  it('opens, flushes changes before a request, and closes on dispose', async () => {
    const client = fakeClient()
    const sync = new LspDocumentSync({
      findOwner: () => owner,
      getClient: async () => client as never
    })
    const m = model('file:///repo/a.tsx')
    sync.track(m)
    await sync.clientFor(m)
    expect(client.notify).toHaveBeenCalledWith('textDocument/didOpen', {
      textDocument: {
        uri: 'file:///repo/a.tsx',
        languageId: 'typescriptreact',
        version: 1,
        text: 'const a = 1'
      }
    })
    m.change('const a = 2')
    await sync.clientFor(m)
    expect(client.notify).toHaveBeenCalledWith('textDocument/didChange', {
      textDocument: { uri: 'file:///repo/a.tsx', version: 2 },
      contentChanges: [{ text: 'const a = 2' }]
    })
    m.dispose()
    expect(client.notify).toHaveBeenLastCalledWith('textDocument/didClose', {
      textDocument: { uri: 'file:///repo/a.tsx' }
    })
  })

  it('replays didOpen when the session reconnects', async () => {
    const first = fakeClient()
    const second = fakeClient()
    const getClient = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(second)
    const sync = new LspDocumentSync({ findOwner: () => owner, getClient })
    const m = model('file:///repo/a.ts')
    sync.track(m)
    await sync.clientFor(m)
    first.isClosed = true
    await sync.clientFor(m)
    expect(second.notify).toHaveBeenCalledWith('textDocument/didOpen', expect.anything())
  })

  it('sends exactly one didOpen when clientFor calls race on first open', async () => {
    const client = fakeClient()
    const sync = new LspDocumentSync({
      findOwner: () => owner,
      getClient: async () => client as never
    })
    const m = model('file:///repo/a.ts')
    sync.track(m)
    await Promise.all([sync.clientFor(m), sync.clientFor(m), sync.clientFor(m)])
    const opens = client.notify.mock.calls.filter(([method]) => method === 'textDocument/didOpen')
    expect(opens).toHaveLength(1)
    expect(
      client.notify.mock.calls.filter(([method]) => method === 'textDocument/didChange')
    ).toHaveLength(0)
  })
})

describe('lspLanguageIdForPath', () => {
  it('maps JSX extensions to the react language ids tsserver expects', () => {
    expect(lspLanguageIdForPath('/a.tsx', 'typescript')).toBe('typescriptreact')
    expect(lspLanguageIdForPath('/a.jsx', 'javascript')).toBe('javascriptreact')
    expect(lspLanguageIdForPath('/a.rb', 'ruby')).toBe('ruby')
  })
})
