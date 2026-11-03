import { resolve as resolvePath } from 'node:path'
import type { CommandHandler } from '../dispatch'
import type { RuntimeClient } from '../runtime-client'
import { errorMessage } from '../../shared/error-message'
import {
  formatDeployCheckConfigText,
  type MteDeployCheckConfig,
  type MteDeployCheckReport
} from '../../shared/mte/deploy-check'
import {
  realMemoryWorkspacePath,
  resolveMemoryWorkspaceRoot
} from '../../shared/mte/memory-workspace-root'

type DeployCheckContext = {
  flags: Map<string, string | boolean>
  client: RuntimeClient
  cwd: string
  json: boolean
}

export type DeployCheckReportInvocation =
  | { ok: true; workspaceRoot: string; summary: string; failed: boolean }
  | { ok: false; message: string }

function resolveWorkspaceRoot(
  flags: Map<string, string | boolean>,
  cwd: string
): string | { error: string } {
  const workspaceFlag = flags.get('workspace')
  if (workspaceFlag !== undefined && (typeof workspaceFlag !== 'string' || workspaceFlag === '')) {
    return { error: '--workspace requires a path value' }
  }
  return realMemoryWorkspacePath(
    typeof workspaceFlag === 'string' ? resolvePath(workspaceFlag) : resolveMemoryWorkspaceRoot(cwd)
  )
}

/** Resolves --summary/--failed/--workspace into the report request, or its usage error. */
export function resolveDeployCheckReportInvocation(
  flags: Map<string, string | boolean>,
  cwd: string
): DeployCheckReportInvocation {
  const summary = flags.get('summary')
  if (typeof summary !== 'string' || summary.trim() === '') {
    return { ok: false, message: '--summary <text> is required (how the deploy was validated)' }
  }
  const root = resolveWorkspaceRoot(flags, cwd)
  if (typeof root !== 'string') {
    return { ok: false, message: root.error }
  }
  return { ok: true, workspaceRoot: root, summary, failed: flags.get('failed') === true }
}

function fail(error: unknown): void {
  process.stderr.write(`${errorMessage(error)}\n`)
  process.exitCode = 1
}

/** Prints the config; the password appears only in --json output, never in text mode. */
export async function runDeployCheckConfig(ctx: DeployCheckContext): Promise<void> {
  const root = resolveWorkspaceRoot(ctx.flags, ctx.cwd)
  if (typeof root !== 'string') {
    fail(root.error)
    return
  }
  try {
    const response = await ctx.client.call<MteDeployCheckConfig>('mte.deployCheckConfig', {
      workspaceRoot: root
    })
    console.log(
      ctx.json
        ? JSON.stringify(response.result, null, 2)
        : formatDeployCheckConfigText(response.result)
    )
  } catch (error) {
    fail(error)
  }
}

export async function runDeployCheckValidated(ctx: DeployCheckContext): Promise<void> {
  const invocation = resolveDeployCheckReportInvocation(ctx.flags, ctx.cwd)
  if (!invocation.ok) {
    fail(invocation.message)
    return
  }
  try {
    const response = await ctx.client.call<MteDeployCheckReport>('mte.deployCheckReport', {
      workspaceRoot: invocation.workspaceRoot,
      summary: invocation.summary,
      ok: !invocation.failed
    })
    console.log(
      ctx.json ? JSON.stringify(response.result, null, 2) : `linear: ${response.result.linear}`
    )
  } catch (error) {
    fail(error)
  }
}

export const MTE_DEPLOY_CHECK_HANDLERS: Record<string, CommandHandler> = {
  'mte deploy-check config': runDeployCheckConfig,
  'mte deploy-check validated': runDeployCheckValidated
}
