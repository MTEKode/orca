import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { callMock, runtimeClientConstructorMock, serveOrcaAppMock, getDefaultUserDataPathMock } =
  vi.hoisted(() => ({
    callMock: vi.fn(),
    runtimeClientConstructorMock: vi.fn(),
    serveOrcaAppMock: vi.fn(),
    getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data')
  }))

vi.mock('../runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('../index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

import { RuntimeClient } from '../runtime-client'
import { REPEATED_FLAG_SEPARATOR } from '../args'
import { setAppEnvironment } from '../../shared/app-environment'
import {
  MTE_START_DEFAULT_GOAL,
  resolveMteStartCliCommand,
  resolveMteStartInvocation,
  resolveMemoryCliInvocation,
  runMteStart,
  type MteStartLaunchArgs
} from './mte'
import { resolveMteCheckInvocation, runMteCheck } from './mte-check'
import { detectChecks } from '../../main/mte-flow/checks/detect-checks'
import type { CheckGroup, CheckGroupResult } from '../../main/mte-flow/checks/run-checks'
import { MTE_PLANNER_PROMPT } from '../../main/mte-flow/planner-prompt'
import type { WorkspaceMcpPlan } from '../../main/mte-flow/mcp/workspace-mcp-config'

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

describe('resolveMteStartInvocation', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-mte-start-'))
    mkdirSync(join(root, '.mte'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('requires a valued --agent', () => {
    const missing = resolveMteStartInvocation(flags([]), root)
    expect(missing).toMatchObject({ ok: false, message: expect.stringContaining('--agent') })
    expect(resolveMteStartInvocation(flags([['agent', true]]), root).ok).toBe(false)
  })

  it('rejects an unknown adapter and a valueless or blank goal', () => {
    expect(
      resolveMteStartInvocation(
        flags([
          ['agent', 'claude'],
          ['adapter', 'gemini']
        ]),
        root
      )
    ).toMatchObject({ ok: false, message: expect.stringContaining('--adapter') })
    expect(
      resolveMteStartInvocation(
        flags([
          ['agent', 'claude'],
          ['adapter', true]
        ]),
        root
      ).ok
    ).toBe(false)
    expect(
      resolveMteStartInvocation(
        flags([
          ['agent', 'claude'],
          ['goal', true]
        ]),
        root
      ).ok
    ).toBe(false)
    expect(
      resolveMteStartInvocation(
        flags([
          ['agent', 'claude'],
          ['goal', '   ']
        ]),
        root
      ).ok
    ).toBe(false)
  })

  it('defaults adapter to claude, goal to the interactive ask, and workspace to the .mte ancestor', () => {
    const nested = join(root, 'pkg', 'src', 'deep')
    mkdirSync(nested, { recursive: true })
    expect(resolveMteStartInvocation(flags([['agent', 'codex']]), nested)).toEqual({
      ok: true,
      agent: 'codex',
      workspaceRoot: root,
      goal: MTE_START_DEFAULT_GOAL,
      adapter: 'claude'
    })
  })

  it('keeps explicit values and resolves an explicit workspace path', () => {
    expect(
      resolveMteStartInvocation(
        flags([
          ['agent', 'claude'],
          ['adapter', 'codex'],
          ['goal', 'Ship it'],
          ['workspace', join(root, 'pkg')]
        ]),
        root
      )
    ).toEqual({
      ok: true,
      agent: 'claude',
      workspaceRoot: join(root, 'pkg'),
      goal: 'Ship it',
      adapter: 'codex'
    })
  })
})

describe('resolveMteStartCliCommand', () => {
  it('prefers ORCA_CLI_COMMAND, then the app command, then the self entry, then orca', () => {
    expect(
      resolveMteStartCliCommand({ ORCA_CLI_COMMAND: ' /usr/local/bin/orca ' }, '/x/y.js')
    ).toBe('/usr/local/bin/orca')
    expect(resolveMteStartCliCommand({}, '/abs/path/cli/index.js', 'orca-dev')).toBe('orca-dev')
    // A packaged app has no orca-dev; the CLI falls back to its own absolute entry.
    setAppEnvironment({
      getPath: () => '/tmp',
      getAppPath: () => '/app',
      getVersion: () => '0.0.0-test',
      isPackaged: () => true,
      onWillQuit: () => {},
      exit: () => {},
      getAppMetrics: () => []
    })
    expect(resolveMteStartCliCommand({}, '/abs/path/cli/index.js')).toBe('/abs/path/cli/index.js')
  })
})

describe('runMteStart', () => {
  let root: string
  const originalExitCode = process.exitCode

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-mte-run-'))
    mkdirSync(join(root, '.mte'))
  })

  afterEach(() => {
    process.exitCode = originalExitCode
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  function fakeDeps(order: string[], launchResult?: 'fail') {
    return {
      cliCommand: '/usr/local/bin/orca',
      applyConfig: vi.fn(async (plan: WorkspaceMcpPlan) => {
        order.push(`apply:${plan.configPath}`)
      }),
      launch: vi.fn(async (args: MteStartLaunchArgs) => {
        order.push(`launch:${args.agent}`)
        if (launchResult === 'fail') {
          throw new Error('agent launch failed')
        }
        return { launchJson: { ok: true }, receiptText: 'agent: chat session' }
      })
    }
  }

  it('applies the claude config before launching the kickoff prompt on the workspace root', async () => {
    const order: string[] = []
    const deps = fakeDeps(order)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runMteStart(
      {
        flags: flags([
          ['agent', 'claude'],
          ['goal', 'Ship the import refactor'],
          ['workspace', root]
        ]),
        client: new RuntimeClient('/tmp/orca-user-data', 1000, null, null),
        cwd: root,
        json: false
      },
      deps
    )

    expect(order).toEqual([`apply:${join(root, '.mcp.json')}`, 'launch:claude'])
    const launched: MteStartLaunchArgs = deps.launch.mock.calls[0]?.[0]
    expect(launched.prompt).toContain(MTE_PLANNER_PROMPT)
    expect(launched.prompt).toContain('Ship the import refactor')
    expect(launched.worktreePath).toBe(root)
    expect(launched.agent).toBe('claude')
    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(output).toContain(`mcp config (claude): ${join(root, '.mcp.json')} (written)`)
    expect(output).toContain('agent: chat session')
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('plans the opencode config for --adapter opencode and reports already-correct configs', async () => {
    const order: string[] = []
    const deps = fakeDeps(order)
    // A semantically correct entry in foreign formatting must plan as a no-op write.
    writeFileSync(
      join(root, 'opencode.json'),
      `${JSON.stringify(
        {
          mcp: {
            'mte-memory': {
              type: 'local',
              command: [
                '/usr/local/bin/orca',
                'mte',
                'memory',
                '--role',
                'orchestrator',
                '--workspace',
                root
              ]
            }
          }
        },
        null,
        4
      )}\n`
    )
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runMteStart(
      {
        flags: flags([
          ['agent', 'opencode'],
          ['adapter', 'opencode'],
          ['workspace', root]
        ]),
        client: new RuntimeClient('/tmp/orca-user-data', 1000, null, null),
        cwd: root,
        json: true
      },
      deps
    )

    expect(order).toEqual([`apply:${join(root, 'opencode.json')}`, 'launch:opencode'])
    const plan: WorkspaceMcpPlan = deps.applyConfig.mock.calls[0]?.[0]
    expect(plan.nextContent).toBeNull()
    const printed = JSON.parse(String(logSpy.mock.calls[0]?.[0]))
    expect(printed.mcpConfig).toEqual({
      adapter: 'opencode',
      configPath: join(root, 'opencode.json'),
      status: 'already correct'
    })
    expect(printed.launch).toEqual({ ok: true })
  })

  it('exits non-zero without applying anything on a usage error', async () => {
    const deps = fakeDeps([])
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await runMteStart(
      {
        flags: flags([]),
        client: new RuntimeClient('/tmp/orca-user-data', 1000, null, null),
        cwd: root,
        json: false
      },
      deps
    )

    expect(process.exitCode).toBe(1)
    expect(deps.applyConfig).not.toHaveBeenCalled()
    expect(deps.launch).not.toHaveBeenCalled()
    expect(String(errSpy.mock.calls[0]?.[0])).toContain('--agent')
  })

  it('keeps the applied config but exits non-zero with the receipt error when launch fails', async () => {
    const order: string[] = []
    const deps = fakeDeps(order, 'fail')
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await runMteStart(
      {
        flags: flags([
          ['agent', 'claude'],
          ['workspace', root]
        ]),
        client: new RuntimeClient('/tmp/orca-user-data', 1000, null, null),
        cwd: root,
        json: false
      },
      deps
    )

    expect(order).toEqual([`apply:${join(root, '.mcp.json')}`, 'launch:claude'])
    expect(process.exitCode).toBe(1)
    expect(String(errSpy.mock.calls[0]?.[0])).toContain('agent launch failed')
  })
})

describe('resolveMteCheckInvocation', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-mte-check-'))
    mkdirSync(join(root, '.mte'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('defaults workspace to the .mte ancestor, timeout to 600, tail to 50 and only to every group', () => {
    const nested = join(root, 'a', 'b')
    mkdirSync(nested, { recursive: true })
    expect(resolveMteCheckInvocation(flags([]), nested)).toEqual({
      ok: true,
      workspaceRoot: root,
      timeoutSeconds: 600,
      tailLines: 50,
      only: [],
      detect: false
    })
  })

  it('parses explicit timeout, tail, workspace and detect', () => {
    const invocation = resolveMteCheckInvocation(
      flags([
        ['workspace', join(root, 'pkg')],
        ['timeout', '120'],
        ['tail', '10'],
        ['detect', true]
      ]),
      root
    )
    expect(invocation).toEqual({
      ok: true,
      workspaceRoot: join(root, 'pkg'),
      timeoutSeconds: 120,
      tailLines: 10,
      only: [],
      detect: true
    })
  })

  it('rejects a valueless or non-positive timeout and tail', () => {
    const timeoutMessage = '--timeout requires a positive integer of seconds'
    expect(resolveMteCheckInvocation(flags([['timeout', true]]), root)).toEqual({
      ok: false,
      message: timeoutMessage
    })
    expect(resolveMteCheckInvocation(flags([['timeout', 'zero']]), root)).toEqual({
      ok: false,
      message: timeoutMessage
    })
    expect(resolveMteCheckInvocation(flags([['timeout', '0']]), root)).toEqual({
      ok: false,
      message: timeoutMessage
    })
    expect(resolveMteCheckInvocation(flags([['tail', '-3']]), root)).toEqual({
      ok: false,
      message: '--tail requires a positive integer of lines'
    })
  })

  it('parses repeatable --only groups and rejects unknown ones or a valueless flag', () => {
    expect(
      resolveMteCheckInvocation(flags([['only', `lint${REPEATED_FLAG_SEPARATOR}test`]]), root)
    ).toMatchObject({ ok: true, only: ['lint', 'test'] })
    expect(resolveMteCheckInvocation(flags([['only', 'deploy']]), root)).toEqual({
      ok: false,
      message: '--only must be one of: lint, typecheck, test'
    })
    expect(resolveMteCheckInvocation(flags([['only', true]]), root)).toEqual({
      ok: false,
      message: '--only requires a group value (lint, typecheck, or test)'
    })
  })
})

describe('runMteCheck', () => {
  let root: string
  const originalExitCode = process.exitCode

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-mte-check-run-'))
    mkdirSync(join(root, '.mte'))
  })

  afterEach(() => {
    process.exitCode = originalExitCode
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  type CheckStatus = CheckGroupResult['status']

  // Fabricated results keep the CLI tests free of real toolchain spawns.
  function groupResult(group: CheckGroup, status: CheckStatus, tail = ''): CheckGroupResult {
    return {
      group,
      command: status === 'skipped' ? 'none' : `${group} command`,
      status,
      exitCode: status === 'failed' ? 2 : status === 'passed' ? 0 : null,
      tail,
      timedOut: false,
      durationMs: 1500
    }
  }

  it('prints the detected LINT/TYPECHECK/TEST commands in --detect mode without running anything', async () => {
    const deps = {
      detect: (workspaceRoot: string) => detectChecks(workspaceRoot),
      run: vi.fn<(options: unknown) => CheckGroupResult[]>(() => [])
    }
    writeFileSync(join(root, 'Makefile'), 'lint:\n\ttrue\n\ntest:\n\ttrue\n')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runMteCheck(
      {
        flags: flags([
          ['detect', true],
          ['workspace', root]
        ]),
        cwd: root,
        json: false
      },
      deps
    )

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(output).toContain('LINT=make lint')
    expect(output).toContain('TYPECHECK=none')
    expect(output).toContain('TEST=make test')
    expect(deps.run).not.toHaveBeenCalled()
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('prints one text line per group on stdout and failure tails on stderr, exiting with the failed count', async () => {
    const deps = {
      run: vi.fn(() => [
        groupResult('lint', 'failed', 'error: lint exploded'),
        groupResult('typecheck', 'passed'),
        groupResult('test', 'skipped')
      ])
    }
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await runMteCheck({ flags: flags([['workspace', root]]), cwd: root, json: false }, deps)

    const stdout = logSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(stdout).toContain('lint=lint command failed (exit 2, 1.5s)')
    expect(stdout).toContain('typecheck=typecheck command passed (exit 0, 1.5s)')
    expect(stdout).toContain('test=none skipped (exit -, 1.5s)')
    expect(process.exitCode).toBe(1)
    const stderr = errSpy.mock.calls.map((call) => String(call[0])).join('')
    expect(stderr).toContain('---- lint (lint command) last lines ----')
    expect(stderr).toContain('  error: lint exploded')
    expect(deps.run).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceRoot: root, timeoutSeconds: 600, tailLines: 50 })
    )
  })

  it('respects --only and forwards it to the runner', async () => {
    const deps = { run: vi.fn(() => [groupResult('lint', 'passed')]) }
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await runMteCheck(
      {
        flags: flags([
          ['workspace', root],
          ['only', 'lint'],
          ['timeout', '30']
        ]),
        cwd: root,
        json: false
      },
      deps
    )

    expect(deps.run).toHaveBeenCalledWith(
      expect.objectContaining({ only: ['lint'], timeoutSeconds: 30 })
    )
    expect(process.exitCode).toBe(0)
  })

  it('emits the JSON shape {workspaceRoot, detected, results, failedGroups} under --json', async () => {
    const deps = {
      detect: () => ({ lint: 'none', typecheck: 'none', test: 'none' }),
      run: vi.fn(() => [
        groupResult('lint', 'failed', 'boom'),
        groupResult('typecheck', 'failed'),
        groupResult('test', 'skipped')
      ])
    }
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runMteCheck(
      {
        flags: flags([
          ['workspace', root],
          ['json', true]
        ]),
        cwd: root,
        json: true
      },
      deps
    )

    const printed = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as Record<string, unknown>
    expect(Object.keys(printed)).toEqual(['workspaceRoot', 'detected', 'results', 'failedGroups'])
    expect(printed.workspaceRoot).toBe(root)
    expect(printed.detected).toEqual({ lint: 'none', typecheck: 'none', test: 'none' })
    expect((printed.results as unknown[]).length).toBe(3)
    expect(printed.failedGroups).toBe(2)
    expect(process.exitCode).toBe(2)
  })

  it('reports usage errors on stderr and exits 1 without running', async () => {
    const deps = { run: vi.fn() }
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await runMteCheck({ flags: flags([['timeout', 'nope']]), cwd: root, json: false }, deps)

    expect(process.exitCode).toBe(1)
    expect(deps.run).not.toHaveBeenCalled()
    expect(String(errSpy.mock.calls[0]?.[0])).toContain('--timeout requires a positive integer')
  })
})
