import { resolveExecutableCommand } from '../../shared/node-cli-command-resolution'
import { hydrateShellPathForAgentDetection } from '../ipc/agent-detection-shell-path'
import type { OpenCodeV2ServiceLaunch } from './opencode-v2-service'

/** A GUI launch's PATH misses nvm/Homebrew; hydrate it, then find the real binary (null when absent). */
export async function resolveOpenCodeV2ServiceLaunch(): Promise<OpenCodeV2ServiceLaunch | null> {
  await hydrateShellPathForAgentDetection().catch(() => undefined)
  const command = resolveExecutableCommand('opencode')
  return command ? { command, env: { PATH: process.env.PATH ?? '' } } : null
}
