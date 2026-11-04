import { describe, expect, it, vi } from 'vitest'

const resolveExecutableCommand = vi.hoisted(() => vi.fn())
vi.mock('../../shared/node-cli-command-resolution', () => ({ resolveExecutableCommand }))
vi.mock('../ipc/agent-detection-shell-path', () => ({
  hydrateShellPathForAgentDetection: async () => undefined
}))

import { resolveOpenCodeV2ServiceLaunch } from './opencode-v2-service-launch'

describe('resolveOpenCodeV2ServiceLaunch', () => {
  it('resolves the bare name without an override', async () => {
    resolveExecutableCommand.mockReturnValue('/bin/opencode')
    expect((await resolveOpenCodeV2ServiceLaunch())?.command).toBe('/bin/opencode')
    expect(resolveExecutableCommand).toHaveBeenLastCalledWith('opencode')
  })

  it('honors the trimmed agentCmdOverrides.opencode', async () => {
    resolveExecutableCommand.mockReturnValue('/custom/oc')
    const launch = await resolveOpenCodeV2ServiceLaunch({
      agentCmdOverrides: { opencode: ' /custom/oc ' }
    })
    expect(resolveExecutableCommand).toHaveBeenLastCalledWith('/custom/oc')
    expect(launch?.command).toBe('/custom/oc')
  })

  it('returns null when the CLI is not found', async () => {
    resolveExecutableCommand.mockReturnValue(null)
    expect(await resolveOpenCodeV2ServiceLaunch()).toBeNull()
  })
})
