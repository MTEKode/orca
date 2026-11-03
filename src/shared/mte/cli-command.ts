// Vendored from src/main/runtime/orchestration/cli-command.ts @ 4d8e8b889f (only runtimeOrchestrationCliCommand; the packaged CLI cannot import src/main).
import { getAppEnvironment, hasAppEnvironment } from '../app-environment'

export type OrchestrationCliCommand = 'orca' | 'orca-dev' | 'orca-ide'

/** Dev builds run the CLI as `orca-dev`; a packaged app, or a process with no app, must not advertise it. */
export function runtimeOrchestrationCliCommand(): OrchestrationCliCommand | undefined {
  return hasAppEnvironment() && !getAppEnvironment().isPackaged() ? 'orca-dev' : undefined
}

/** Absolute path of the orca CLI entry that the MCP config will spawn; env first, then self-reference. */
export function resolveMteStartCliCommand(
  env: NodeJS.ProcessEnv = process.env,
  argv1: string | undefined = process.argv[1],
  appCliCommand: string | undefined = runtimeOrchestrationCliCommand()
): string {
  const configured = env.ORCA_CLI_COMMAND?.trim()
  if (configured) {
    return configured
  }
  // Dev builds with an app environment say orca-dev; packaged and plain CLI runs use their own entry.
  return appCliCommand ?? argv1 ?? 'orca'
}
