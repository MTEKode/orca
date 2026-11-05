import type { TuiAgent } from './agent-launch/catalog/tui-agent'
import { getAgentLaunchExecutableName } from './agent-launch/startup/agent-command-line-intent'
import { findOptionOccurrence } from './command-option-occurrence'

export class OpenCodeCopyServerRouteError extends Error {
  constructor() {
    super(
      'Remove --server from the OpenCode command or arguments in Settings to open a copy in a CLI.'
    )
  }
}

/** A configured server may not hold the copy saved by this execution host. */
export function assertOpenCodeCopyUsesLocalStore(
  args: readonly string[],
  prefixArgs: readonly string[] = []
): void {
  // An opaque launcher prefix can contain its own terminators before the provider's flags.
  if (
    findOptionOccurrence(prefixArgs, ['--server'], false) ||
    findOptionOccurrence(args, ['--server'], true)
  ) {
    throw new OpenCodeCopyServerRouteError()
  }
}

function openCodeCommandAgent(launchCommand: string | undefined): 'opencode' | null {
  const binary = getAgentLaunchExecutableName(launchCommand)
  return binary === 'opencode' ? binary : null
}

export function selectOpenCodeHookAgent(
  launchAgent: TuiAgent | undefined,
  launchCommand: string | undefined,
  isEnabled: (agent: 'opencode') => boolean
): 'opencode' | null {
  const explicit =
    launchAgent === 'opencode'
      ? launchAgent
      : launchAgent === undefined
        ? openCodeCommandAgent(launchCommand)
        : null
  if (explicit) {
    return isEnabled(explicit) ? explicit : null
  }
  return isEnabled('opencode') ? 'opencode' : null
}
