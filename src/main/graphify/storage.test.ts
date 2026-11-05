import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { setAppEnvironment, type AppEnvironment } from '../../shared/app-environment'
import { graphDirForRepo, graphOutDir, readGraphStatus } from './storage'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'graphify-'))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
  setAppEnvironment({ getPath: () => dir } as unknown as AppEnvironment)
})

describe('storage', () => {
  it('reports missing, then built with counts from graph.json', () => {
    expect(readGraphStatus('r1').state).toBe('missing')
    mkdirSync(graphOutDir('r1'), { recursive: true })
    writeFileSync(
      join(graphOutDir('r1'), 'graph.json'),
      JSON.stringify({
        nodes: [{ file_type: 'code' }, { file_type: 'document' }],
        links: [{ source: 'a', target: 'b' }]
      })
    )
    const s = readGraphStatus('r1')
    expect(s).toMatchObject({ state: 'built', nodeCount: 2, edgeCount: 1, semantic: true })
    expect(s.builtAt).toBeGreaterThan(0)
  })
  it('does not report semantic for AST-origin document/rationale nodes', () => {
    mkdirSync(graphOutDir('r2'), { recursive: true })
    const write = (nodes: unknown[]): void =>
      writeFileSync(join(graphOutDir('r2'), 'graph.json'), JSON.stringify({ nodes, links: [] }))
    write([
      { file_type: 'code', _origin: 'ast' },
      { file_type: 'document', _origin: 'ast' },
      { file_type: 'rationale', _origin: 'ast' },
      { file_type: 'concept' }
    ])
    expect(readGraphStatus('r2').semantic).toBe(false)
    write([
      { file_type: 'code', _origin: 'ast' },
      { file_type: 'document', _origin: 'llm' }
    ])
    expect(readGraphStatus('r2').semantic).toBe(true)
  })
  it('rejects path-traversing repo ids', () => {
    expect(() => graphDirForRepo('../x')).toThrow()
    expect(graphDirForRepo('abc-1')).toBe(join(dir, 'graphify', 'abc-1'))
  })
})
