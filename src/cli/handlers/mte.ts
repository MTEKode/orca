import { resolve as resolvePath } from 'node:path'
import { readOrcaCliVersion } from '../cli-version'
import type { CommandHandler } from '../dispatch'
import type { RuntimeClient } from '../runtime-client'
import { errorMessage } from '../../shared/error-message'
import { plannerKickoffPrompt } from '../../shared/mte/planner-prompt'
import {
  applyWorkspaceMcpConfig,
  planWorkspaceMcpConfig,
  type WorkspaceMcpAdapter,
  type WorkspaceMcpPlan
} from '../../shared/mte/mcp/workspace-mcp-config'
import { runMemoryMcpServer } from '../../shared/mte/mcp/memory-mcp-server'
import {
  realMemoryWorkspacePath,
  resolveMemoryWorkspaceRoot
} from '../../shared/mte/memory-workspace-root'
import { runtimeOrchestrationCliCommand } from '../../shared/mte/cli-command'
import type { MemoryRole } from '../../shared/mte/memory-store'
import {
  isWorkspaceRegistrationError,
  launchPlannerChat,
  registerWorkspaceRepo,
  type MteStartLaunch,
  type MteStartLaunchOutcome
} from './mte-start-launch'
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
  return {
    ok: true,
    role,
    workspaceRoot: realMemoryWorkspacePath(workspaceFlag ?? resolveMemoryWorkspaceRoot(cwd))
  }
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
  const workspaceRoot = realMemoryWorkspacePath(
    typeof workspaceFlag === 'string' && workspaceFlag.length > 0
      ? resolvePath(workspaceFlag)
      : resolveMemoryWorkspaceRoot(cwd)
  )
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
    const launch = deps.launch ?? launchPlannerChat
    const launchArgs = {
      client: ctx.client,
      agent: invocation.agent,
      prompt: plannerKickoffPrompt(invocation.goal),
      worktreePath: invocation.workspaceRoot,
      cwd: ctx.cwd
    }
    let launchRetry: 'repo-add' | undefined
    let outcome: MteStartLaunchOutcome
    try {
      outcome = await launch(launchArgs)
    } catch (error) {
      if (!isWorkspaceRegistrationError(error)) {
        throw error
      }
      // Register the workspace exactly once, then give the launch a single second chance.
      await registerWorkspaceRepo(ctx.client, invocation.workspaceRoot, ctx.cwd)
      launchRetry = 'repo-add'
      outcome = await launch(launchArgs)
    }
    if (ctx.json) {
      console.log(
        JSON.stringify(
          {
            mcpConfig: { adapter: plan.adapter, configPath: plan.configPath, status: configStatus },
            launch: outcome.launchJson,
            ...(launchRetry ? { launchRetry } : {})
          },
          null,
          2
        )
      )
    } else {
      console.log(`mcp config (${plan.adapter}): ${plan.configPath} (${configStatus})`)
      if (launchRetry) {
        console.log('workspace was not registered; applied repo add and retried the launch')
      }
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
