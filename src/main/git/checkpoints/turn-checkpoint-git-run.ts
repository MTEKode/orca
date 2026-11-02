// Shared execution for turn-checkpoint git commands: the mutating tier discard uses,
// the standard non-interactive env, and the host-filesystem view of guest git paths.

import { realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { toWindowsWslPath } from '../../../shared/wsl-paths'
import type { GitRuntimeOptions } from '../git-runtime-options'
import { gitOptionsForWorktree } from '../git-runtime-options'
import { gitExecFileAsync } from '../runner'

export type TurnCheckpointRuntime = GitRuntimeOptions

export type TurnCheckpointGitResult = { stdout: string; stderr: string }

/** Checkpoints mutate the object store and refs; run them at the tier discard-changes uses. */
export function runCheckpointGit(
  cwd: string,
  args: string[],
  runtime: TurnCheckpointRuntime = {},
  extra: { env?: NodeJS.ProcessEnv; stdin?: string } = {}
): Promise<TurnCheckpointGitResult> {
  return gitExecFileAsync(args, {
    ...gitOptionsForWorktree(cwd, {
      ...runtime,
      admissionTier: runtime.admissionTier ?? 'interactive'
    }),
    ...extra
  })
}

/** `git rev-parse -q --verify <rev>`; null when the revision does not exist. */
export async function verifyCheckpointRev(
  cwd: string,
  rev: string,
  runtime: TurnCheckpointRuntime = {}
): Promise<string | null> {
  try {
    const { stdout } = await runCheckpointGit(cwd, ['rev-parse', '-q', '--verify', rev], runtime)
    const oid = stdout.trim()
    return oid === '' ? null : oid
  } catch {
    return null
  }
}

/** Node-filesystem view of a path git reported: WSL guest paths need their Windows form. */
export function checkpointHostFsPath(gitPath: string, wslDistro?: string | null): string {
  return process.platform === 'win32' && wslDistro ? toWindowsWslPath(gitPath, wslDistro) : gitPath
}

export async function checkpointRealpath(
  gitPath: string,
  wslDistro?: string | null
): Promise<string> {
  return realpath(checkpointHostFsPath(gitPath, wslDistro))
}

/** The resolved per-worktree git dir, in git's own path view. */
export async function checkpointGitDir(
  cwd: string,
  runtime: TurnCheckpointRuntime = {}
): Promise<string> {
  const { stdout } = await runCheckpointGit(cwd, ['rev-parse', '--absolute-git-dir'], runtime)
  return stdout.trim()
}

/** Unresolved conflict stages make both snapshots and restores ambiguous. */
export async function checkpointHasUnmergedEntries(
  cwd: string,
  runtime: TurnCheckpointRuntime = {}
): Promise<boolean> {
  const { stdout } = await runCheckpointGit(cwd, ['ls-files', '-u'], runtime)
  return stdout.trim() !== ''
}

const BUSY_MARKERS = [
  'rebase-merge',
  'rebase-apply',
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'BISECT_LOG'
] as const

/** A git operation in progress owns the index and HEAD; snapshots must not interleave with it. */
export async function checkpointOperationInProgress(
  gitDir: string,
  runtime: TurnCheckpointRuntime = {}
): Promise<boolean> {
  for (const marker of BUSY_MARKERS) {
    try {
      await stat(join(checkpointHostFsPath(gitDir, runtime.wslDistro), marker))
      return true
    } catch {
      // A missing marker is the healthy case.
    }
  }
  return false
}

const RESET_STATE_MARKERS = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'] as const

/** Merge/cherry-pick/revert state that a restore must blow away before reading trees. */
export async function checkpointResetStatePresent(
  gitDir: string,
  runtime: TurnCheckpointRuntime = {}
): Promise<boolean> {
  for (const marker of RESET_STATE_MARKERS) {
    try {
      await stat(join(checkpointHostFsPath(gitDir, runtime.wslDistro), marker))
      return true
    } catch {
      // A missing marker is the healthy case.
    }
  }
  return false
}
