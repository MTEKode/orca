import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAppEnvironment, type AppEnvironment } from '../../shared/app-environment'
import { build, buildGraphifyEnv, getGraphifyLog, update } from './runner'

function fakeSpawn() {
  const children: (EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: () => void
  })[] = []
  const spawn = vi.fn(() => {
    const c = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: () => {}
    })
    children.push(c)
    return c
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
  return { spawn: spawn as never, spawnMock: spawn, children }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'graphify-run-'))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
  setAppEnvironment({ getPath: () => dir, onWillQuit: () => {} } as unknown as AppEnvironment)
})

describe('runner', () => {
  it('runs one process at a time: builds queue, updates are skipped while busy', async () => {
    const f = fakeSpawn()
    const deps = { spawn: f.spawn, ensure: async () => 'graphify', googleKey: () => null }
    const first = build({ repoId: 'a', repoRoot: '/r' }, deps)
    await tick()
    const second = build({ repoId: 'b', repoRoot: '/r2' }, deps)
    const skipped = await update({ repoId: 'a', repoRoot: '/r' }, deps)
    expect(skipped.skipped).toBe(true)
    expect(f.children).toHaveLength(1)
    f.children[0].stderr.emit('data', Buffer.from('hello\n'))
    // build = extract + cluster-only; the queued build starts only after both finish.
    f.children[0].emit('close', 0)
    await tick()
    expect(f.children).toHaveLength(2)
    f.children[1].emit('close', 0)
    expect((await first).ok).toBe(true)
    await tick()
    await tick()
    expect(f.children).toHaveLength(3)
    f.children[2].emit('close', 1)
    expect((await second).ok).toBe(false)
    expect(getGraphifyLog('a')).toContain('hello')
  })

  it('passes GEMINI_API_KEY only when a key is stored and never logs it', async () => {
    const f = fakeSpawn()
    const p = build(
      { repoId: 'k', repoRoot: '/r' },
      { spawn: f.spawn, ensure: async () => 'graphify', googleKey: () => 'SECRET' }
    )
    await tick()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
    const [, args, opts] = f.spawnMock.mock.calls[0] as unknown as [
      string,
      string[],
      { env: NodeJS.ProcessEnv }
    ]
    expect(opts.env.GEMINI_API_KEY).toBe('SECRET')
    expect(args).toContain('gemini')
    expect(args.join(' ')).not.toContain('SECRET')
    f.children[0].emit('close', 0)
    await tick()
    f.children[1].emit('close', 0)
    await p
    expect(getGraphifyLog('k').join('\n')).not.toContain('SECRET')
  })

  it('scrubs ambient provider keys when no key is stored', () => {
    vi.stubEnv('GEMINI_API_KEY', 'ambient')
    expect(buildGraphifyEnv('x', null).GEMINI_API_KEY).toBeUndefined()
    vi.unstubAllEnvs()
  })
})
