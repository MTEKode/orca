import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { failedGroupCount, runChecks, type CheckGroupResult } from './run-checks'

describe('runChecks', () => {
  let base: string
  const originalPath = process.env.PATH

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'orca-mte-run-'))
  })

  afterEach(() => {
    rmSync(base, { recursive: true, force: true })
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }
  })

  // A bare python fixture routes every group through PATH stubs: plain echo/exit scripts.
  function pythonFixture(ruffBody: string): { root: string; bin: string } {
    const root = join(base, 'py-fixture')
    const bin = join(base, 'py-bin')
    mkdirSync(root)
    writeFileSync(join(root, 'pyproject.toml'), '[project]\nname = "demo"\nversion = "0.0.1"\n')
    mkdirSync(bin)
    for (const [name, body] of [
      ['ruff', ruffBody],
      ['pytest', '#!/bin/sh\necho tests passed\n']
    ] as const) {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}`)
      chmodSync(join(bin, name), 0o755)
    }
    process.env.PATH = `${bin}:/usr/bin:/bin`
    return { root, bin }
  }

  it('marks a passing group passed with exit 0 and an empty tail', () => {
    const { root } = pythonFixture('echo ruff ok\n')
    const results = runChecks({ workspaceRoot: root, timeoutSeconds: 30 })
    const lint = results.find((result) => result.group === 'lint')
    expect(lint).toMatchObject({
      group: 'lint',
      command: 'ruff check .',
      status: 'passed',
      exitCode: 0,
      tail: '',
      timedOut: false
    })
    expect(lint?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('captures the last N combined lines of a failing group', () => {
    const lines = Array.from({ length: 60 }, (_, index) => `echo line-${index + 1}`)
    const { root } = pythonFixture(`${lines.join('\n')}\necho ruff stderr >&2\nexit 3\n`)
    const results = runChecks({ workspaceRoot: root, tailLines: 3, timeoutSeconds: 30 })
    const lint = results.find((result) => result.group === 'lint')
    expect(lint).toMatchObject({ status: 'failed', exitCode: 3, timedOut: false })
    expect(lint?.tail.split('\n')).toEqual(['line-59', 'line-60', 'ruff stderr'])
    // Passing and skipped groups carry no tail.
    const pytest = results.find((result) => result.group === 'test')
    expect(pytest).toMatchObject({ status: 'passed' })
    expect(pytest?.tail).toBe('')
  })

  it('skips groups whose detected command is none', () => {
    const root = join(base, 'nothing-detected')
    mkdirSync(root)
    const results = runChecks({ workspaceRoot: root, timeoutSeconds: 30 })
    expect(results.map((result) => result.command)).toEqual(['none', 'none', 'none'])
    expect(results.map((result) => result.status)).toEqual(['skipped', 'skipped', 'skipped'])
    for (const result of results) {
      expect(result.exitCode).toBeNull()
      expect(result.tail).toBe('')
    }
    expect(failedGroupCount(results)).toBe(0)
  })

  it('flags a timed-out group as failed with no exit code', () => {
    const { root } = pythonFixture('sleep 5\n')
    const results = runChecks({ workspaceRoot: root, timeoutSeconds: 1 })
    const lint = results.find((result) => result.group === 'lint')
    expect(lint).toMatchObject({
      group: 'lint',
      status: 'failed',
      exitCode: null,
      timedOut: true
    })
    expect(failedGroupCount(results)).toBe(1)
  })

  it('respects the only filter and keeps group order', () => {
    const { root } = pythonFixture('echo ruff ok\n')
    const results = runChecks({ workspaceRoot: root, timeoutSeconds: 30, only: ['test', 'lint'] })
    expect(results.map((result) => result.group)).toEqual(['lint', 'test'])
  })

  it('echoes per-group progress lines when onProgress is given', () => {
    const { root } = pythonFixture('echo ok\n')
    const lines: string[] = []
    runChecks({
      workspaceRoot: root,
      timeoutSeconds: 30,
      only: ['lint'],
      onProgress: (line) => {
        lines.push(line)
      }
    })
    expect(lines.length).toBe(2)
    expect(lines[0]).toContain('lint: running ruff check .')
    expect(lines[1]).toContain('lint: passed exit=0')
  })

  it('counts failed groups exactly', () => {
    const result = (group: CheckGroupResult['group'], status: CheckGroupResult['status']) =>
      ({
        group,
        command: status === 'skipped' ? 'none' : 'x',
        status,
        exitCode: status === 'failed' ? 1 : null,
        tail: '',
        timedOut: false,
        durationMs: 0
      }) satisfies CheckGroupResult
    expect(failedGroupCount([])).toBe(0)
    expect(
      failedGroupCount([
        result('lint', 'passed'),
        result('typecheck', 'failed'),
        result('test', 'failed')
      ])
    ).toBe(2)
    expect(failedGroupCount([result('lint', 'skipped')])).toBe(0)
  })
})
