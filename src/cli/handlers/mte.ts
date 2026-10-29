import { resolve as resolvePath } from 'node:path'
import { readOrcaCliVersion } from '../cli-version'
import type { CommandHandler } from '../dispatch'
import {
  callAgentLaunch,
  formatAgentLaunch,
  getAgentLaunchCapabilities,
  parseCliAgent,
  readCliAgentLaunch
} from '../agent-launch-request'
import { RuntimeClientError, type RuntimeClient } from '../runtime-client'
import { getRequiredWorktreeSelector } from '../selectors'
import { errorMessage } from '../../shared/error-message'
import { plannerKickoffPrompt } from '../../main/mte-flow/planner-prompt'
import {
  applyWorkspaceMcpConfig,
  planWorkspaceMcpConfig,
  type WorkspaceMcpAdapter,
  type WorkspaceMcpPlan
} from '../../main/mte-flow/mcp/workspace-mcp-config'
import { runMemoryMcpServer } from '../../main/mte-flow/mcp/memory-mcp-server'
import { resolveMemoryWorkspaceRoot } from '../../main/mte-flow/memory-workspace-root'
import { runtimeOrchestrationCliCommand } from '../../main/runtime/orchestration/cli-command'
import type { MemoryRole } from '../../main/mte-flow/memory-store'
import { runMteCheck } from './mte-check'

const MEMORY_ROLE_FLAGS = ['orchestrator', 'coder', 'validator'] as const

type MemoryRoleFlag = (typeof MEMORY_ROLE_FLAGS)[number]

// A narrowing scan keeps role parsing free of enum assertions.
function parseMemoryRoleFlag(value: string | boolean | undefined): MemoryRoleFlag | null {
  if (typeof value !== 'string') {
    return null
  }
  for (const role of MEMORY_ROLE_FLAGS) {
    if (role === value) {
      return role
    }
  }
  return null
}

export type MemoryCliInvocation =
  | { ok: true; role: MemoryRole; workspaceRoot: string }
  | { ok: false; message: string }

/** Resolves --role/--workspace into a server invocation, or the usage error that must end the command. */
export function resolveMemoryCliInvocation(
  flags: Map<string, string | boolean>,
  cwd: string
): MemoryCliInvocation {
  const role = parseMemoryRoleFlag(flags.get('role'))
  if (role === null) {
    return { ok: false, message: '--role must be one of: orchestrator, coder, validator' }
  }
  const workspaceFlag = flags.get('workspace')
  if (workspaceFlag !== undefined && (typeof workspaceFlag !== 'string' || workspaceFlag === '')) {
    return { ok: false, message: '--workspace requires a path value' }
  }
  return { ok: true, role, workspaceRoot: workspaceFlag ?? resolveMemoryWorkspaceRoot(cwd) }
}

// Usage failures must exit before any protocol byte reaches stdout.
function refuseUsage(message: string): void {
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}

const MTE_START_ADAPTERS = ['claude', 'opencode', 'codex'] as const

/** Goal embedded in the kickoff prompt when --goal is omitted: the planner asks the user first. */
export const MTE_START_DEFAULT_GOAL =
  'Ask the user for the goal of this MTE run, then run the requirement interview on it.'

function parseStartAdapterFlag(value: string | boolean | undefined): WorkspaceMcpAdapter | null {
  if (typeof value !== 'string') {
    return null
  }
  for (const adapter of MTE_START_ADAPTERS) {
    if (adapter === value) {
      return adapter
    }
  }
  return null
}

export type MteStartInvocation =
  | {
      ok: true
      agent: string
      workspaceRoot: string
      goal: string
      adapter: WorkspaceMcpAdapter
    }
  | { ok: false; message: string }

/** Resolves --agent/--workspace/--goal/--adapter into the planner bootstrap, or its usage error. */
export function resolveMteStartInvocation(
  flags: Map<string, string | boolean>,
  cwd: string
): MteStartInvocation {
  const agent = flags.get('agent')
  if (typeof agent !== 'string' || agent.length === 0) {
    return {
      ok: false,
      message: '--agent <id> is required (the planner chat agent, such as claude or codex)'
    }
  }
  const workspaceFlag = flags.get('workspace')
  if (workspaceFlag !== undefined && (typeof workspaceFlag !== 'string' || workspaceFlag === '')) {
    return { ok: false, message: '--workspace requires a path value' }
  }
  let goal = MTE_START_DEFAULT_GOAL
  const goalFlag = flags.get('goal')
  if (goalFlag !== undefined) {
    if (typeof goalFlag !== 'string' || goalFlag.trim() === '') {
      return { ok: false, message: '--goal requires a text value' }
    }
    goal = goalFlag
  }
  const adapterFlag = flags.get('adapter')
  let adapter: WorkspaceMcpAdapter = 'claude'
  if (adapterFlag !== undefined) {
    const parsed = parseStartAdapterFlag(adapterFlag)
    if (parsed === null) {
      return { ok: false, message: '--adapter must be one of: claude, opencode, codex' }
    }
    adapter = parsed
  }
  const workspaceRoot =
    typeof workspaceFlag === 'string' && workspaceFlag.length > 0
      ? resolvePath(workspaceFlag)
      : resolveMemoryWorkspaceRoot(cwd)
  return { ok: true, agent, workspaceRoot, goal, adapter }
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
async function launchPlannerChat(args: MteStartLaunchArgs): Promise<MteStartLaunchOutcome> {
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

export type MteStartDeps = {
  applyConfig?: (plan: WorkspaceMcpPlan) => Promise<void>
  launch?: MteStartLaunch
  cliCommand?: string
}

/** Applies the workspace MCP config, then delegates the planner launch; failures exit non-zero. */
export async function runMteStart(
  ctx: {
    flags: Map<string, string | boolean>
    client: RuntimeClient
    cwd: string
    json: boolean
  },
  deps: MteStartDeps = {}
): Promise<void> {
  const invocation = resolveMteStartInvocation(ctx.flags, ctx.cwd)
  if (!invocation.ok) {
    refuseUsage(invocation.message)
    return
  }
  const plan = planWorkspaceMcpConfig({
    adapter: invocation.adapter,
    workspaceRoot: invocation.workspaceRoot,
    orcaCliCommand: deps.cliCommand ?? resolveMteStartCliCommand(),
    role: 'orchestrator'
  })
  const configStatus = plan.nextContent === null ? 'already correct' : 'written'
  try {
    await (deps.applyConfig ?? applyWorkspaceMcpConfig)(plan)
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`)
    process.exitCode = 1
    return
  }
  try {
    const outcome = await (deps.launch ?? launchPlannerChat)({
      client: ctx.client,
      agent: invocation.agent,
      prompt: plannerKickoffPrompt(invocation.goal),
      worktreePath: invocation.workspaceRoot,
      cwd: ctx.cwd
    })
    if (ctx.json) {
      console.log(
        JSON.stringify(
          {
            mcpConfig: { adapter: plan.adapter, configPath: plan.configPath, status: configStatus },
            launch: outcome.launchJson
          },
          null,
          2
        )
      )
    } else {
      console.log(`mcp config (${plan.adapter}): ${plan.configPath} (${configStatus})`)
      console.log(outcome.receiptText)
    }
  } catch (error) {
    // The MCP config may remain; an idempotent rerun only relaunches the planner.
    process.stderr.write(`${errorMessage(error)}\n`)
    process.exitCode = 1
  }
}

export const MTE_HANDLERS: Record<string, CommandHandler> = {
  'mte memory': async (ctx) => {
    const invocation = resolveMemoryCliInvocation(ctx.flags, process.cwd())
    if (!invocation.ok) {
      refuseUsage(invocation.message)
      return
    }
    try {
      await runMemoryMcpServer(process.stdin, process.stdout, {
        role: invocation.role,
        workspaceRoot: invocation.workspaceRoot,
        version: readOrcaCliVersion() ?? '0.0.0'
      })
    } catch (error) {
      // Startup failures wrote no protocol bytes; keep the failure on stderr.
      process.stderr.write(`${errorMessage(error)}\n`)
      process.exitCode = 1
    }
  },
  'mte start': async (ctx) => {
    await runMteStart({
      flags: ctx.flags,
      client: ctx.client,
      cwd: ctx.cwd,
      json: ctx.json
    })
  },
  'mte check': async (ctx) => {
    // Stderr tails keep agent-readable reports on stdout and failure detail on stderr.
    await runMteCheck({ flags: ctx.flags, cwd: ctx.cwd, json: ctx.json })
  }
}
