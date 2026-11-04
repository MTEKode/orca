import { describe, expect, it, vi } from 'vitest'
import { GRAPH_HANDLERS } from './graph'

function ctx(flags: Record<string, string | boolean>) {
  const calls: [string, unknown][] = []
  const client = {
    isRemote: false,
    call: vi.fn(async (method: string, params?: unknown) => {
      calls.push([method, params])
      if (method === 'worktree.show') {
        return { result: { worktree: { repoId: 'repo-1' } } }
      }
      if (method === 'graphify.openViewer') {
        return { result: { url: 'file:///g.html' } }
      }
      return { result: { started: true } }
    })
  }
  return {
    calls,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
    c: {
      flags: new Map(Object.entries(flags)),
      client,
      cwd: '/w',
      json: true,
      rawArgs: []
    } as never
  }
}

describe('graph handlers', () => {
  it('build resolves the repo from the cwd workspace and forwards --deep', async () => {
    const { calls, c } = ctx({ deep: true })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await GRAPH_HANDLERS['graph build'](c)
    expect(calls[0]).toEqual(['worktree.show', { worktree: 'path:/w' }])
    expect(calls[1]).toEqual(['graphify.build', { repoId: 'repo-1', deep: true }])
  })
  it('open prints the viewer url and tries the embedded browser', async () => {
    const { calls, c } = ctx({})
    await GRAPH_HANDLERS['graph open'](c)
    expect(calls.map((x) => x[0])).toEqual([
      'worktree.show',
      'graphify.openViewer',
      'browser.tabCreate'
    ])
  })
})
