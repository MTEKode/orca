import { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import type { InteractiveLoginSession } from './interactive-login-interruption'

const { spawn, signalTree, forceTree, inFlightKill } = vi.hoisted(() => ({
  spawn: vi.fn(),
  signalTree: vi.fn(),
  forceTree: vi.fn(),
  inFlightKill: vi.fn()
}))
vi.mock('@orca/process-host', () => ({ spawnProcess: spawn }))
vi.mock('@orca/process-host/process-tree-termination', () => ({
  signalProcessTree: signalTree,
  forceTerminateProcessTree: forceTree
}))
vi.mock('@orca/process-host/windows-tree-kill', () => ({ inFlightWindowsTreeKill: inFlightKill }))
vi.mock('../../shared/node-cli-command-resolution', () => ({
  resolveCliCommand: (command: string) => command,
  withCliRuntimeOnPath: (_command: string, env: NodeJS.ProcessEnv) => env
}))
import { resolveOpenCodeLoginCommand } from './opencode-account-login-command'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
afterEach(() => {
  Object.defineProperty(process, 'platform', platform)
  vi.useRealTimers()
  vi.resetAllMocks()
})
function probe() {
  return Object.assign(new ChildProcess(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn()
  })
}
function session(): InteractiveLoginSession {
  return { child: null, registering: false, terminationPromise: null }
}

it('a timely root exit clears execution timeout while trailing help drains, then releases late events', async () => {
  vi.useFakeTimers()
  const child = probe()
  spawn.mockReturnValue(child)
  const owner = session()
  const pending = resolveOpenCodeLoginCommand({}, owner)
  await vi.advanceTimersByTimeAsync(9_900)
  child.emit('exit', 0)
  await vi.advanceTimersByTimeAsync(200)
  child.stderr.write('--standalone  trailing help')
  expect(signalTree).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(800)
  await expect(pending).resolves.toBe('opencode')
  expect(child.stdout.destroyed && child.stderr.destroyed && child.stdin.destroyed).toBe(true)
  expect(owner).toMatchObject({ child: null, stopPhase: undefined, terminationPromise: null })
  // Late errors/close from this released handle cannot affect a later owner.
  const next = probe()
  owner.child = next
  child.emit('error', new Error('late error'))
  child.emit('close', 0)
  expect(owner.child).toBe(next)
  expect(vi.getTimerCount()).toBe(0)
})

it('asynchronous spawn error releases readers before the final refusal', async () => {
  const child = probe()
  spawn.mockImplementationOnce(() => {
    queueMicrotask(() => child.emit('error', new Error('ENOENT')))
    return child
  })
  const owner = session()
  await expect(resolveOpenCodeLoginCommand({}, owner)).rejects.toThrow(
    'Install or repair OpenCode 2'
  )
  expect(spawn).toHaveBeenCalledTimes(1)
  expect(child.stdout.destroyed && child.stderr.destroyed && child.stdin.destroyed).toBe(true)
  expect(owner.child).toBeNull()
  expect(owner.stopPhase).toBeUndefined()
  expect(signalTree).not.toHaveBeenCalled()
  child.emit('error', new Error('late error'))
  child.emit('exit', 0)
  child.emit('close', 0)
})
