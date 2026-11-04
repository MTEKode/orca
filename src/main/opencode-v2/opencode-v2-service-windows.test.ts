import { describe, expect, it, vi } from 'vitest'
import { createOpenCodeV2Service } from './opencode-v2-service'

vi.mock('../../shared/windows-batch-spawn', () => ({
  getSpawnArgsForWindows: (command: string, args: string[]) => ({
    spawnCmd: 'cmd.exe',
    spawnArgs: ['/d', '/c', '@', command, ...args]
  })
}))

describe('OpenCode v2 service launch on Windows batch shims', () => {
  it('wraps the command through the shared batch-spawn helper', async () => {
    const ensure = vi.fn(async () => ({ url: 'http://x' }))
    const resolver = createOpenCodeV2Service({
      service: { ensure, headers: () => undefined, registrationPath: () => '/r' },
      launch: async () => ({ command: 'C:\\npm\\opencode.cmd' }),
      readFile: async () => '{}'
    })
    await resolver.endpoint()
    expect(ensure).toHaveBeenCalledWith(
      expect.objectContaining({
        command: ['cmd.exe', '/d', '/c', '@', 'C:\\npm\\opencode.cmd', 'serve', '--service']
      })
    )
  })
})
