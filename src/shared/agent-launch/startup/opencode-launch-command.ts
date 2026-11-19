import type { TuiAgent } from '../catalog/tui-agent'
import { getAgentLaunchExecutableName } from './agent-command-line-intent'
import { findOptionOccurrence } from '../../cli/command-option-occurrence'

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
  isEnabled: (agent: 'opencode' | 'opencode2') => boolean,
  isOnPath: (agent: 'opencode' | 'opencode2') => boolean
): 'opencode' | 'opencode2' | null {
  const explicit =
    launchAgent === 'opencode'
      ? launchAgent
      : launchAgent === undefined
        ? openCodeCommandAgent(launchCommand)
        : null
  if (explicit) {
    return isEnabled(explicit) ? explicit : null
  }
  // A plain shell gets a plugin only for a CLI the user could type there (#43445).
  return (
    (['opencode', 'opencode2'] as const).find((agent) => isEnabled(agent) && isOnPath(agent)) ??
    null
  )
}
