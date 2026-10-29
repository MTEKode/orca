import { readOrcaCliVersion } from '../cli-version'
import type { CommandHandler } from '../dispatch'
import { runMemoryMcpServer } from '../../main/mte-flow/mcp/memory-mcp-server'
import { resolveMemoryWorkspaceRoot } from '../../main/mte-flow/memory-workspace-root'
import { errorMessage } from '../../shared/error-message'
import type { MemoryRole } from '../../main/mte-flow/memory-store'

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
  }
}
