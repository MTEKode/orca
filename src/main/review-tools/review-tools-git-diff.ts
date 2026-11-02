// Workspace diff for review tools: a merge-base..working-tree patch that includes uncommitted
// and untracked files. Reuses the branch-compare OID primitives and the turn-checkpoint
// working-tree builder (temp index, .gitignore-aware) instead of a second diff engine.

import { StringDecoder } from 'node:string_decoder'
import { getBaseRefDefault } from '../git/repo'
import { isMaxBufferOverflowError } from '../git/max-buffer-overflow'
import { gitExecFileAsync } from '../git/runner'
import { gitOptionsForWorktree, type GitRuntimeOptions } from '../git/git-runtime-options'
import { resolveMergeBase, resolveRefOid } from '../git/source-control/compare-ref-oids'
import { literalPathspec } from '../git/source-control/git-pathspec'
import { MAX_GIT_SHOW_BYTES } from '../git/source-control/git-show-max-bytes'
import {
  checkpointGitDir,
  verifyCheckpointRev,
  type TurnCheckpointRuntime
} from '../git/checkpoints/turn-checkpoint-git-run'
import {
  buildCheckpointWorktreeTree,
  createCheckpointTempIndex
} from '../git/checkpoints/turn-checkpoint-temp-index'

/** Agent-facing cap; larger diffs truncate with a notice pointing at the file filter. */
export const REVIEW_WORKSPACE_DIFF_MAX_BYTES = 256 * 1024

export type ReviewWorkspaceDiffResult = { diff: string; truncated: boolean } | { error: string }

export type ReviewWorkspaceDiffOptions = {
  file?: string
  wslDistro?: string | null
  /** Pinned base from workspace/repo metadata; absent falls back to the repository default. */
  pinnedBaseRef?: string | null
}

function truncateToBytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buffer = Buffer.from(text, 'utf8')
  if (buffer.byteLength <= maxBytes) {
    return { text, truncated: false }
  }
  // StringDecoder keeps a multi-byte character split by the cap from becoming mojibake.
  return { text: new StringDecoder('utf8').write(buffer.subarray(0, maxBytes)), truncated: true }
}

export async function readReviewWorkspaceDiff(
  worktreePath: string,
  options: ReviewWorkspaceDiffOptions = {}
): Promise<ReviewWorkspaceDiffResult> {
  const runtime: TurnCheckpointRuntime = options.wslDistro ? { wslDistro: options.wslDistro } : {}
  const gitOptions: GitRuntimeOptions = { ...runtime, admissionTier: 'interactive' }
  try {
    const head = await verifyCheckpointRev(worktreePath, 'HEAD', runtime)
    if (head === null) {
      return {
        error:
          'This branch does not have a committed HEAD yet, so there is no base to diff against.'
      }
    }
    const baseRef =
      options.pinnedBaseRef?.trim() || (await getBaseRefDefault(worktreePath, runtime)) || null
    if (!baseRef) {
      return {
        error:
          'No base branch could be resolved for this repository, so there is nothing to compare against.'
      }
    }
    let mergeBase: string
    try {
      const baseOid = await resolveRefOid(worktreePath, baseRef, gitOptions)
      mergeBase = await resolveMergeBase(worktreePath, baseOid, head, gitOptions)
    } catch {
      return {
        error: `Base ref ${baseRef} does not share a merge base with this branch, so the workspace diff is unavailable.`
      }
    }
    const gitDir = await checkpointGitDir(worktreePath, runtime)
    const tempIndex = await createCheckpointTempIndex(gitDir, runtime)
    let worktreeTree: string
    try {
      worktreeTree = await buildCheckpointWorktreeTree(worktreePath, tempIndex, {
        seed: head,
        runtime
      })
    } finally {
      await tempIndex.dispose()
    }
    const args = [
      '-c',
      'core.quotePath=false',
      'diff',
      '--patch',
      '--minimal',
      '--no-color',
      '--no-ext-diff',
      mergeBase,
      worktreeTree
    ]
    if (options.file) {
      args.push('--', literalPathspec(options.file, worktreePath, gitOptions))
    }
    const { stdout } = await gitExecFileAsync(args, {
      ...gitOptionsForWorktree(worktreePath, gitOptions),
      maxBuffer: MAX_GIT_SHOW_BYTES
    })
    const { text, truncated } = truncateToBytes(stdout, REVIEW_WORKSPACE_DIFF_MAX_BYTES)
    return {
      diff: truncated
        ? `${text}\n[... diff truncated at ${REVIEW_WORKSPACE_DIFF_MAX_BYTES} bytes; pass a file path to read one file's changes ...]`
        : text,
      truncated
    }
  } catch (error) {
    if (isMaxBufferOverflowError(error)) {
      return {
        error:
          'The workspace diff is too large to read in one piece. Pass a file path to read one file at a time.'
      }
    }
    return {
      error: error instanceof Error ? error.message : 'Failed to read the workspace diff.'
    }
  }
}
