import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveOpenCodeV2Command } from './opencode-v2-runtime-metadata'

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function fakeExecutable(name = 'opencode'): { directory: string; command: string } {
  const baseTmp = process.platform === 'win32' ? tmpdir() : '/tmp'
  const directory = mkdtempSync(join(baseTmp, 'opencode-command-'))
  scratch.push(directory)
  const command = join(directory, name)
  writeFileSync(command, '#!/bin/sh\nexit 0\n')
  chmodSync(command, 0o755)
  return { directory, command }
}

describe('resolveOpenCodeV2Command', () => {
  it('resolves opencode on PATH to an absolute path when present and preserves env', () => {
    const { directory, command } = fakeExecutable('opencode')
    const env = { PATH: directory, HOME: '/tmp/test-home' }
    const result = resolveOpenCodeV2Command(env, {})

    expect(result.command).toBe(command)
    expect(result.prefixArgs).toEqual([])
    expect(result.env).toBe(env)
  })

  it('respects commandSettings.agentCmdOverrides.opencode', () => {
    const { command: customCommand } = fakeExecutable('custom-opencode')
    const env = { PATH: '/usr/bin:/bin', HOME: '/tmp/test-home' }
    const result = resolveOpenCodeV2Command(env, {
      agentCmdOverrides: { opencode: customCommand }
    })

    expect(result.command).toBe(customCommand)
    expect(result.prefixArgs).toEqual([])
    expect(result.env).toBe(env)
  })
})
