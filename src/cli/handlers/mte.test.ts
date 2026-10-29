import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveMemoryCliInvocation } from './mte'

function flags(entries: [string, string | boolean][]): Map<string, string | boolean> {
  return new Map<string, string | boolean>(entries)
}

describe('resolveMemoryCliInvocation', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-mte-cli-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects a missing, unknown or valueless role before anything runs', () => {
    const message = '--role must be one of: orchestrator, coder, validator'
    expect(resolveMemoryCliInvocation(flags([]), root)).toEqual({ ok: false, message })
    expect(resolveMemoryCliInvocation(flags([['role', 'admin']]), root)).toEqual({
      ok: false,
      message
    })
    expect(resolveMemoryCliInvocation(flags([['role', true]]), root)).toEqual({
      ok: false,
      message
    })
  })

  it('rejects --workspace without a usable value', () => {
    const message = '--workspace requires a path value'
    expect(
      resolveMemoryCliInvocation(
        flags([
          ['role', 'coder'],
          ['workspace', true]
        ]),
        root
      )
    ).toEqual({ ok: false, message })
    expect(
      resolveMemoryCliInvocation(
        flags([
          ['role', 'coder'],
          ['workspace', '']
        ]),
        root
      ).ok
    ).toBe(false)
  })

  it('accepts every role with an explicit workspace path', () => {
    for (const role of ['orchestrator', 'coder', 'validator'] as const) {
      expect(
        resolveMemoryCliInvocation(
          flags([
            ['role', role],
            ['workspace', root]
          ]),
          root
        )
      ).toEqual({ ok: true, role, workspaceRoot: root })
    }
  })

  it('defaults the workspace to the nearest .git/.mte ancestor of cwd', () => {
    const nested = join(root, 'a', 'b')
    mkdirSync(nested, { recursive: true })
    mkdirSync(join(nested, '.mte'))
    expect(resolveMemoryCliInvocation(flags([['role', 'validator']]), join(nested, 'c'))).toEqual({
      ok: true,
      role: 'validator',
      workspaceRoot: nested
    })
  })
})
