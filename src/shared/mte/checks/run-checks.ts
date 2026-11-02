import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectChecks } from './detect-checks'

export type CheckGroup = 'lint' | 'typecheck' | 'test'

export type CheckGroupResult = {
  group: CheckGroup
  command: string
  status: 'passed' | 'failed' | 'skipped'
  exitCode: number | null
  tail: string
  timedOut: boolean
  durationMs: number
}

export type RunChecksOptions = {
  workspaceRoot: string
  timeoutSeconds?: number
  tailLines?: number
  only?: readonly CheckGroup[]
  onProgress?: (line: string) => void
}

const GROUP_ORDER: readonly CheckGroup[] = ['lint', 'typecheck', 'test']
export const DEFAULT_TIMEOUT_SECONDS = 600
export const DEFAULT_TAIL_LINES = 50
// Generous cap so chatty toolchains are fully captured wherever stdout is piped.
const MAX_BUFFER_BYTES = 64 * 1024 * 1024

function readTextOrEmpty(file: string): string {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function lastLines(output: string, tailLines: number): string {
  if (tailLines <= 0) {
    return ''
  }
  return output.split(/\r?\n/).slice(-tailLines).join('\n')
}

function chosenGroups(only: readonly CheckGroup[] | undefined): readonly CheckGroup[] {
  if (only === undefined || only.length === 0) {
    return GROUP_ORDER
  }
  return GROUP_ORDER.filter((group) => only.includes(group))
}

function skippedGroup(group: CheckGroup): CheckGroupResult {
  return {
    group,
    command: 'none',
    status: 'skipped',
    exitCode: null,
    tail: '',
    timedOut: false,
    durationMs: 0
  }
}

/** Runs detected groups sequentially (lint, typecheck, test); 'none' commands are skipped. */
export function runChecks(options: RunChecksOptions): CheckGroupResult[] {
  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS
  const tailLines = options.tailLines ?? DEFAULT_TAIL_LINES
  const detected = detectChecks(options.workspaceRoot)
  const results: CheckGroupResult[] = []
  for (const group of chosenGroups(options.only)) {
    results.push(runOneGroup(group, detected[group], options, timeoutSeconds, tailLines))
  }
  return results
}

function runOneGroup(
  group: CheckGroup,
  command: string,
  options: RunChecksOptions,
  timeoutSeconds: number,
  tailLines: number
): CheckGroupResult {
  if (command === 'none') {
    options.onProgress?.(`${group}=none skipped (not configured for this stack)`)
    return skippedGroup(group)
  }
  options.onProgress?.(`${group}: running ${command}`)
  const started = Date.now()
  // Output goes to a temp log so a timeout-killed shell cannot leave orphaned children holding our pipes open.
  const logFile = join(tmpdir(), `mte-check-${process.pid}-${group}.log`)
  const res = spawnSync(`${command} > "${logFile}" 2>&1`, {
    shell: true,
    cwd: options.workspaceRoot,
    timeout: timeoutSeconds * 1000,
    stdio: 'ignore',
    maxBuffer: MAX_BUFFER_BYTES
  })
  const durationMs = Date.now() - started
  const timedOut =
    (res.error !== undefined && 'code' in res.error && res.error.code === 'ETIMEDOUT') ||
    res.signal === 'SIGTERM'
  // Spawn failures co-travel with the log so timeouts still leave a readable tail.
  const output =
    `${readTextOrEmpty(logFile)}${res.error === undefined ? '' : String(res.error)}`.trimEnd()
  try {
    rmSync(logFile, { force: true })
  } catch {
    // Best effort; the report is already captured.
  }
  const passed = res.status === 0 && res.error === undefined
  const tail = passed ? '' : lastLines(output, tailLines)
  const exitText = res.status === null ? 'signal' : String(res.status)
  options.onProgress?.(`${group}: ${passed ? 'passed' : 'failed'} exit=${exitText}`)
  return {
    group,
    command,
    status: passed ? 'passed' : 'failed',
    exitCode: res.status ?? null,
    tail,
    timedOut,
    durationMs
  }
}

/** Number of failed groups — the process exit code contract. */
export function failedGroupCount(results: readonly CheckGroupResult[]): number {
  return results.filter((result) => result.status === 'failed').length
}
