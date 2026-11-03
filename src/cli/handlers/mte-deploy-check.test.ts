import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeClient } from '../runtime-client'
import {
  resolveDeployCheckReportInvocation,
  runDeployCheckConfig,
  runDeployCheckValidated
} from './mte-deploy-check'

function flags(entries: [string, string | boolean][]): Map<string, string | boolean> {
  return new Map(entries)
}

function clientReturning(result: unknown): {
  client: RuntimeClient
  call: ReturnType<typeof vi.fn>
} {
  const call = vi.fn().mockResolvedValue({ result })
  return { client: { call } as unknown as RuntimeClient, call }
}

const roots: string[] = []
function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'deploy-check-cli-')))
  mkdirSync(join(root, '.git'))
  roots.push(root)
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('resolveDeployCheckReportInvocation', () => {
  it('requires --summary', () => {
    expect(resolveDeployCheckReportInvocation(flags([]), '/tmp')).toEqual({
      ok: false,
      message: '--summary <text> is required (how the deploy was validated)'
    })
  })

  it('resolves the workspace root and the failed flag', () => {
    const root = makeRoot()
    expect(
      resolveDeployCheckReportInvocation(
        flags([
          ['summary', 'it works'],
          ['failed', true]
        ]),
        root
      )
    ).toEqual({ ok: true, workspaceRoot: root, summary: 'it works', failed: true })
  })
})

describe('deploy-check commands', () => {
  it('prints the password only in --json mode', async () => {
    const root = makeRoot()
    const config = {
      configured: true,
      url: 'https://x.test',
      username: 'bot',
      password: 'hunter2',
      linearDoneState: 'Done'
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { client, call } = clientReturning(config)
    await runDeployCheckConfig({ flags: flags([]), client, cwd: root, json: false })
    expect(call).toHaveBeenCalledWith('mte.deployCheckConfig', { workspaceRoot: root })
    expect(log.mock.calls.flat().join('\n')).not.toContain('hunter2')
    log.mockClear()
    await runDeployCheckConfig({ flags: flags([]), client, cwd: root, json: true })
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual(config)
  })

  it('sends ok=false for --failed and prints the outcome', async () => {
    const root = makeRoot()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { client, call } = clientReturning({ linear: 'commented' })
    await runDeployCheckValidated({
      flags: flags([
        ['summary', 'broken'],
        ['failed', true]
      ]),
      client,
      cwd: root,
      json: false
    })
    expect(call).toHaveBeenCalledWith('mte.deployCheckReport', {
      workspaceRoot: root,
      summary: 'broken',
      ok: false
    })
    expect(log).toHaveBeenCalledWith('linear: commented')
  })
})
