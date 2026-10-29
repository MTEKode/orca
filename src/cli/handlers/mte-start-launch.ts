import type { RuntimeClient } from '../runtime-client'
import { RuntimeClientError } from '../runtime/types'
import {
  callAgentLaunch,
  formatAgentLaunch,
  getAgentLaunchCapabilities,
  parseCliAgent,
  readCliAgentLaunch
} from '../agent-launch-request'
import { getRequiredWorktreeSelector } from '../selectors'
import { resolveRepoPathArgument } from '../repo-path-arguments'

export type MteStartLaunchArgs = {
  client: RuntimeClient
  agent: string
  prompt: string
  worktreePath: string
  cwd: string
}

export type MteStartLaunchOutcome = {
  launchJson: unknown
  receiptText: string
}

export type MteStartLaunch = (args: MteStartLaunchArgs) => Promise<MteStartLaunchOutcome>

// Reuses the agent-launch machinery exactly as `orca agent launch --surface chat` does.
export async function launchPlannerChat(args: MteStartLaunchArgs): Promise<MteStartLaunchOutcome> {
  if (args.client.isRemote) {
    throw new RuntimeClientError('invalid_argument', 'orca mte start runs on the local host only.')
  }
  const agent = parseCliAgent(args.agent)
  const launch = readCliAgentLaunch(
    new Map<string, string | boolean>([
      ['prompt', args.prompt],
      ['surface', 'chat']
    ]),
    agent,
    { createsWorktree: false }
  )
  const worktree = await getRequiredWorktreeSelector(
    new Map<string, string | boolean>([['worktree', `path:${args.worktreePath}`]]),
    'worktree',
    args.cwd,
    args.client
  )
  const capabilities = await getAgentLaunchCapabilities(args.client)
  if (!capabilities) {
    throw new RuntimeClientError(
      'incompatible_runtime',
      'This Orca host cannot start agents from the CLI. Update Orca on the execution host.'
    )
  }
  const result = await callAgentLaunch(
    args.client,
    launch,
    { target: { kind: 'existing', worktree }, presentation: 'background' },
    capabilities
  )
  return {
    launchJson: result,
    receiptText: formatAgentLaunch(result.result)
  }
}

// The runtime names the unregistered-workspace launch-failure class selector_not_found (or repo_not_found).
export function isWorkspaceRegistrationError(error: unknown): boolean {
  if (error instanceof RuntimeClientError) {
    return error.code === 'selector_not_found' || error.code === 'repo_not_found'
  }
  return error instanceof Error && /selector_not_found|repo_not_found/.test(error.message)
}

// Mirrors `orca repo add --path` so the registered path matches the retried launch selector.
export async function registerWorkspaceRepo(
  client: RuntimeClient,
  workspaceRoot: string,
  cwd: string
): Promise<void> {
  await client.call('repo.add', {
    path: resolveRepoPathArgument(workspaceRoot, cwd, client.isRemote, 'Remote repo add')
  })
}
