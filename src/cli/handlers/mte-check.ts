import { resolve as resolvePath } from 'node:path'
import { REPEATED_FLAG_SEPARATOR } from '../args'
import { detectChecks, type DetectedChecks } from '../../shared/mte/checks/detect-checks'
import {
  failedGroupCount,
  runChecks,
  DEFAULT_TAIL_LINES,
  DEFAULT_TIMEOUT_SECONDS,
  type CheckGroup,
  type CheckGroupResult,
  type RunChecksOptions
} from '../../shared/mte/checks/run-checks'
import { resolveMemoryWorkspaceRoot } from '../../shared/mte/memory-workspace-root'

// Usage failures must exit before any check byte reaches stdout.
function refuseUsage(message: string): void {
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}

const CHECK_GROUPS: readonly CheckGroup[] = ['lint', 'typecheck', 'test']

/** A narrowing scan keeps group parsing free of enum assertions. */
function parseCheckGroup(value: string): CheckGroup | null {
  for (const group of CHECK_GROUPS) {
    if (group === value) {
      return group
    }
  }
  return null
}

export type MteCheckInvocation =
  | {
      ok: true
      workspaceRoot: string
      timeoutSeconds: number
      tailLines: number
      only: readonly CheckGroup[]
      detect: boolean
    }
  | { ok: false; message: string }

// Returns the parsed count, or the usage-error message when the flag value is not a positive integer.
function parseCountFlag(
  flags: Map<string, string | boolean>,
  name: string,
  error: string
): number | string {
  const value = flags.get(name)
  if (value === undefined) {
    return 0 // sentinel: caller substitutes the default
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return error
}

/** Resolves --workspace/--timeout/--tail/--only/--detect into the checks runner invocation. */
export function resolveMteCheckInvocation(
  flags: Map<string, string | boolean>,
  cwd: string
): MteCheckInvocation {
  const workspaceFlag = flags.get('workspace')
  if (workspaceFlag !== undefined && (typeof workspaceFlag !== 'string' || workspaceFlag === '')) {
    return { ok: false, message: '--workspace requires a path value' }
  }
  const workspaceRoot =
    typeof workspaceFlag === 'string' && workspaceFlag.length > 0
      ? resolvePath(workspaceFlag)
      : resolveMemoryWorkspaceRoot(cwd)
  const timeoutSeconds = parseCountFlag(
    flags,
    'timeout',
    '--timeout requires a positive integer of seconds'
  )
  if (typeof timeoutSeconds !== 'number') {
    return { ok: false, message: timeoutSeconds }
  }
  const tailLines = parseCountFlag(flags, 'tail', '--tail requires a positive integer of lines')
  if (typeof tailLines !== 'number') {
    return { ok: false, message: tailLines }
  }
  const only: CheckGroup[] = []
  const onlyFlag = flags.get('only')
  if (onlyFlag !== undefined) {
    if (typeof onlyFlag !== 'string' || onlyFlag.length === 0) {
      return { ok: false, message: '--only requires a group value (lint, typecheck, or test)' }
    }
    for (const raw of onlyFlag.split(REPEATED_FLAG_SEPARATOR)) {
      const group = parseCheckGroup(raw)
      if (group === null) {
        return { ok: false, message: '--only must be one of: lint, typecheck, test' }
      }
      only.push(group)
    }
  }
  return {
    ok: true,
    workspaceRoot,
    timeoutSeconds: timeoutSeconds === 0 ? DEFAULT_TIMEOUT_SECONDS : timeoutSeconds,
    tailLines: tailLines === 0 ? DEFAULT_TAIL_LINES : tailLines,
    only,
    detect: flags.get('detect') === true
  }
}

function describeCheckGroup(result: CheckGroupResult): string {
  const exitText = result.exitCode === null ? '-' : String(result.exitCode)
  const seconds = (result.durationMs / 1000).toFixed(1)
  const note = result.timedOut ? ' (timed out)' : ''
  return `${result.group}=${result.command} ${result.status} (exit ${exitText}, ${seconds}s)${note}`
}

function printFailureTail(result: CheckGroupResult): void {
  if (result.status !== 'failed' || result.tail === '') {
    return
  }
  const lines = result.tail.split('\n').map((line) => `  ${line}`)
  process.stderr.write(
    `  ---- ${result.group} (${result.command}) last lines ----\n${lines.join('\n')}\n`
  )
}

export type MteCheckDeps = {
  detect?: (workspaceRoot: string) => DetectedChecks
  run?: (options: RunChecksOptions) => CheckGroupResult[]
}

/** Detect-only mode prints the detected commands and exits 0; run mode exits with the failed-group count. */
export async function runMteCheck(
  ctx: {
    flags: Map<string, string | boolean>
    cwd: string
    json: boolean
  },
  deps: MteCheckDeps = {}
): Promise<void> {
  const invocation = resolveMteCheckInvocation(ctx.flags, ctx.cwd)
  if (!invocation.ok) {
    refuseUsage(invocation.message)
    return
  }
  const detect = deps.detect ?? detectChecks
  if (invocation.detect) {
    const detected = detect(invocation.workspaceRoot)
    console.log(`LINT=${detected.lint}`)
    console.log(`TYPECHECK=${detected.typecheck}`)
    console.log(`TEST=${detected.test}`)
    return
  }
  const results = (deps.run ?? runChecks)({
    workspaceRoot: invocation.workspaceRoot,
    timeoutSeconds: invocation.timeoutSeconds,
    tailLines: invocation.tailLines,
    only: invocation.only
  })
  if (ctx.json) {
    console.log(
      JSON.stringify(
        {
          workspaceRoot: invocation.workspaceRoot,
          detected: detect(invocation.workspaceRoot),
          results,
          failedGroups: failedGroupCount(results)
        },
        null,
        2
      )
    )
  } else {
    for (const result of results) {
      console.log(describeCheckGroup(result))
      printFailureTail(result)
    }
  }
  process.exitCode = failedGroupCount(results)
}
