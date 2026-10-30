// Save and restore turn checkpoints as private refs, without moving HEAD on save.
// A checkpoint commit's message carries the head/index/worktree oids it restores from.

import {
  checkpointGitDir,
  checkpointHasUnmergedEntries,
  checkpointOperationInProgress,
  checkpointRealpath,
  checkpointResetStatePresent,
  runCheckpointGit,
  verifyCheckpointRev,
  type TurnCheckpointRuntime
} from './turn-checkpoint-git-run'
import {
  buildCheckpointWorktreeTree,
  createCheckpointTempIndex
} from './turn-checkpoint-temp-index'
import {
  sanitizeCheckpointIdSegment,
  TURN_CHECKPOINT_REF_PREFIX,
  turnCheckpointRef,
  type TurnCheckpointId
} from './turn-checkpoint-ids'

export type TurnCheckpointSaveResult =
  | { status: 'saved'; ref: string; commit: string }
  | { status: 'refused' }
  | { status: 'skipped'; reason: 'busy' | 'conflicted' | 'unborn-head' }

const ZERO_OID = '0'.repeat(40)
const CHECKPOINT_IDENTITY = [
  '-c',
  'user.name=Orca Checkpointer',
  '-c',
  'user.email=checkpoint@orca.invalid'
] as const

function requireCheckpointRef(ref: string): string {
  if (!ref.startsWith(TURN_CHECKPOINT_REF_PREFIX)) {
    throw new Error(`Not a turn-checkpoint ref: ${JSON.stringify(ref)}`)
  }
  const segments = ref.slice(TURN_CHECKPOINT_REF_PREFIX.length).split('/')
  if (segments.length !== 3) {
    throw new Error(`Not a turn-checkpoint ref: ${JSON.stringify(ref)}`)
  }
  for (const segment of segments) {
    sanitizeCheckpointIdSegment(segment, 'ref segment')
  }
  return ref
}

function readCheckpointMetadata(rawCommit: string): {
  head: string
  indexTree: string
  worktreeTree: string
} | null {
  const field = (key: string): string | null => {
    const match = rawCommit.match(new RegExp(`^${key} (.+)$`, 'm'))
    return match ? match[1].trim() : null
  }
  const head = field('head')
  const indexTree = field('index-tree')
  const worktreeTree = field('worktree-tree')
  return head && indexTree && worktreeTree ? { head, indexTree, worktreeTree } : null
}

/** Snapshot HEAD + index + full working tree into `refs/orca-checkpoints/<id>`; never touches files. */
export async function saveCheckpoint(
  cwd: string,
  options: { id: TurnCheckpointId; runtime?: TurnCheckpointRuntime }
): Promise<TurnCheckpointSaveResult> {
  const runtime = options.runtime ?? {}
  const ref = turnCheckpointRef(options.id)
  const { stdout: toplevel } = await runCheckpointGit(
    cwd,
    ['rev-parse', '--show-toplevel'],
    runtime
  )
  // An ancestor toplevel means cwd lost its own checkout; operating would snapshot a foreign repo.
  if (
    (await checkpointRealpath(toplevel.trim(), runtime.wslDistro)) !==
    (await checkpointRealpath(cwd, runtime.wslDistro))
  ) {
    return { status: 'refused' }
  }
  const gitDir = await checkpointGitDir(cwd, runtime)
  if (await checkpointOperationInProgress(gitDir, runtime)) {
    return { status: 'skipped', reason: 'busy' }
  }
  if (await checkpointHasUnmergedEntries(cwd, runtime)) {
    return { status: 'skipped', reason: 'conflicted' }
  }
  const head = await verifyCheckpointRev(cwd, 'HEAD', runtime)
  if (head === null) {
    return { status: 'skipped', reason: 'unborn-head' }
  }
  const { stdout: indexTreeRaw } = await runCheckpointGit(cwd, ['write-tree'], runtime)
  const indexTree = indexTreeRaw.trim()
  const tempIndex = await createCheckpointTempIndex(gitDir, runtime)
  let worktreeTree: string
  try {
    worktreeTree = await buildCheckpointWorktreeTree(cwd, tempIndex, { seed: indexTree, runtime })
  } finally {
    await tempIndex.dispose()
  }
  const id = `${options.id.sessionId}/${options.id.turnId}/${options.id.kind}`
  const message = [
    `checkpoint:${id}`,
    `head ${head}`,
    `index-tree ${indexTree}`,
    `worktree-tree ${worktreeTree}`,
    `created ${new Date().toISOString()}`
  ].join('\n')
  const { stdout: commit } = await runCheckpointGit(
    cwd,
    [...CHECKPOINT_IDENTITY, 'commit-tree', worktreeTree],
    runtime,
    { stdin: `${message}\n` }
  )
  const commitOid = commit.trim()
  await runCheckpointGit(cwd, ['update-ref', ref, commitOid], runtime)
  return { status: 'saved', ref, commit: commitOid }
}

/** Move HEAD, index and working tree (untracked included, ignored kept) back to a checkpoint. */
export async function restoreCheckpoint(
  cwd: string,
  options: { ref: string; runtime?: TurnCheckpointRuntime }
): Promise<{ restored: true }> {
  const runtime = options.runtime ?? {}
  const ref = requireCheckpointRef(options.ref)
  const commit = await verifyCheckpointRev(cwd, ref, runtime)
  if (commit === null) {
    throw new Error(`Checkpoint not found: ${ref}`)
  }
  const { stdout: rawCommit } = await runCheckpointGit(cwd, ['cat-file', 'commit', commit], runtime)
  const metadata = readCheckpointMetadata(rawCommit)
  if (!metadata) {
    throw new Error(`Checkpoint is missing metadata: ${ref}`)
  }
  if (metadata.head === ZERO_OID) {
    throw new Error(`Checkpoint was saved with an unborn HEAD: ${ref}`)
  }
  const gitDir = await checkpointGitDir(cwd, runtime)
  const currentHead = await verifyCheckpointRev(cwd, 'HEAD', runtime)
  // Steady-state no-ops skip the reset so a repeated restore adds no reflog churn.
  if (
    currentHead !== metadata.head ||
    (await checkpointHasUnmergedEntries(cwd, runtime)) ||
    (await checkpointResetStatePresent(gitDir, runtime))
  ) {
    await runCheckpointGit(cwd, ['reset', '-q', '--mixed', metadata.head], runtime)
  }
  await runCheckpointGit(cwd, ['read-tree', '--reset', metadata.head], runtime)
  await runCheckpointGit(cwd, ['add', '-A', '--', '.'], runtime)
  await runCheckpointGit(cwd, ['read-tree', '--reset', '-u', metadata.worktreeTree], runtime)
  await runCheckpointGit(cwd, ['clean', '-fd'], runtime)
  await runCheckpointGit(cwd, ['read-tree', '--reset', metadata.indexTree], runtime)
  try {
    await runCheckpointGit(cwd, ['update-index', '-q', '--refresh'], runtime)
  } catch {
    // A stale stat cache only costs the next status its rehash.
  }
  return { restored: true }
}
