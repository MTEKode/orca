// Vendored from src/main/runtime/orchestration/cli-command.ts @ 4d8e8b889f (only runtimeOrchestrationCliCommand; the packaged CLI cannot import src/main).
import { getAppEnvironment, hasAppEnvironment } from '../app-environment'

export type OrchestrationCliCommand = 'orca' | 'orca-dev' | 'orca-ide'

/** Dev builds run the CLI as `orca-dev`; a packaged app, or a process with no app, must not advertise it. */
export function runtimeOrchestrationCliCommand(): OrchestrationCliCommand | undefined {
  return hasAppEnvironment() && !getAppEnvironment().isPackaged() ? 'orca-dev' : undefined
}
