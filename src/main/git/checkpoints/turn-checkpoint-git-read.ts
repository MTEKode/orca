// Read side of turn checkpoints: diff against the current worktree, list refs, delete, and GC.

import type {
  AgentSessionTurnCheckpointDiffFile,
  AgentSessionTurnCheckpointDiffResult,
  AgentSessionTurnCheckpointDiffStatus
} from '../../../shared/agent-session-turn-checkpoints'
import {
  checkpointGitDir,
  runCheckpointGit,
  verifyCheckpointRev,
  type TurnCheckpointRuntime
} from './turn-checkpoint-git-run'
import {
  buildCheckpointWorktreeTree,
  createCheckpointTempIndex
} from './turn-checkpoint-temp-index'
import {
  parseTurnCheckpointRef,
  sanitizeCheckpointRefSegment,
  TURN_CHECKPOINT_REF_PREFIX
} from './turn-checkpoint-ids'

export type TurnCheckpointListEntry = {
  ref: string
  commit: string
  /** for-each-ref creatordate, iso-strict. */
  createdAt: string
}

const NAME_STATUS_CODES: Record<string, AgentSessionTurnCheckpointDiffStatus> = {
  A: 'added',
  M: 'modified',
  T: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'added'
}

function parseNameStatus(
  line: string
): { path: string; status: AgentSessionTurnCheckpointDiffStatus } | null {
  const [code, ...paths] = line.split('\t')
  // Renames and copies name the old path first; the new path is the file that exists now.
  const path = paths.at(-1)
  const status = path === undefined ? undefined : NAME_STATUS_CODES[code.charAt(0)]
  return path === undefined || !status ? null : { path, status }
}

function parseNumstat(line: string): { added: number; removed: number } {
  const [added, removed] = line.split('\t')
  // Binary files report '-'; they change without line counts.
  return {
    added: Number.parseInt(added, 10) || 0,
    removed: Number.parseInt(removed, 10) || 0
  }
}

/** Files that differ between one checkpoint and the current full working tree. */
export async function diffCheckpoint(
  cwd: string,
  options: { ref: string; runtime?: TurnCheckpointRuntime }
): Promise<AgentSessionTurnCheckpointDiffResult> {
  const runtime = options.runtime ?? {}
  if (!options.ref.startsWith(TURN_CHECKPOINT_REF_PREFIX)) {
    throw new Error(`Not a turn-checkpoint ref: ${JSON.stringify(options.ref)}`)
  }
  const commit = await verifyCheckpointRev(cwd, options.ref, runtime)
  if (commit === null) {
    throw new Error(`Checkpoint not found: ${options.ref}`)
  }
  const gitDir = await checkpointGitDir(cwd, runtime)
  const head = await verifyCheckpointRev(cwd, 'HEAD', runtime)
  const tempIndex = await createCheckpointTempIndex(gitDir, runtime)
  let currentTree: string
  try {
    currentTree = await buildCheckpointWorktreeTree(cwd, tempIndex, { seed: head, runtime })
  } finally {
    await tempIndex.dispose()
  }
  const diffArgs = ['-c', 'core.quotePath=false', 'diff']
  const [{ stdout: nameStatus }, { stdout: numstat }] = await Promise.all([
    runCheckpointGit(cwd, [...diffArgs, '--name-status', commit, currentTree], runtime),
    runCheckpointGit(cwd, [...diffArgs, '--numstat', commit, currentTree], runtime)
  ])
  const counts = numstat.split('\n').filter((line) => line !== '')
  const files: AgentSessionTurnCheckpointDiffFile[] = []
  // Both diffs walk the same change set, so the nth numstat row counts the nth name-status row.
  nameStatus.split('\n').forEach((line, index) => {
    if (line === '') {
      return
    }
    const named = parseNameStatus(line)
    if (!named) {
      return
    }
    files.push({
      ...named,
      ...(counts[index] ? parseNumstat(counts[index]) : { added: 0, removed: 0 })
    })
  })
  const totals = files.reduce(
    (sum, file) => ({
      files: sum.files + 1,
      added: sum.added + file.added,
      removed: sum.removed + file.removed
    }),
    { files: 0, added: 0, removed: 0 }
  )
  return { files, totals }
}

/** Every checkpoint ref under `<prefix>`; the prefix is validated as ref segments. */
export async function listCheckpoints(
  cwd: string,
  options: { prefix: string; runtime?: TurnCheckpointRuntime }
): Promise<TurnCheckpointListEntry[]> {
  const runtime = options.runtime ?? {}
  const prefix = options.prefix
  if (!prefix.startsWith(TURN_CHECKPOINT_REF_PREFIX)) {
    throw new Error(`Not a turn-checkpoint ref prefix: ${JSON.stringify(prefix)}`)
  }
  for (const segment of prefix
    .slice(TURN_CHECKPOINT_REF_PREFIX.length)
    .split('/')
    .filter(Boolean)) {
    sanitizeCheckpointRefSegment(segment, 'ref segment')
  }
  const { stdout } = await runCheckpointGit(
    cwd,
    ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(creatordate:iso-strict)', prefix],
    runtime
  )
  return stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [ref, commit, createdAt] = line.split('\0')
      return { ref, commit, createdAt }
    })
}

export async function deleteCheckpoints(
  cwd: string,
  options: { refs: readonly string[]; runtime?: TurnCheckpointRuntime }
): Promise<void> {
  const runtime = options.runtime ?? {}
  for (const ref of options.refs) {
    if (!ref.startsWith(TURN_CHECKPOINT_REF_PREFIX)) {
      throw new Error(`Not a turn-checkpoint ref: ${JSON.stringify(ref)}`)
    }
    await runCheckpointGit(cwd, ['update-ref', '-d', ref], runtime)
  }
}

/** Drop whole turns oldest-first beyond `keepTurns`, so a session's refs stay bounded. */
export async function pruneCheckpointTurns(
  cwd: string,
  options: { prefix: string; keepTurns: number; runtime?: TurnCheckpointRuntime }
): Promise<number> {
  const entries = await listCheckpoints(cwd, options)
  const byTurn = new Map<string, { refs: string[]; newest: number }>()
  for (const entry of entries) {
    const parsed = parseTurnCheckpointRef(entry.ref, options.prefix)
    if (!parsed) {
      continue
    }
    const created = Date.parse(entry.createdAt)
    const turn = byTurn.get(parsed.turnId) ?? { refs: [], newest: Number.NaN }
    turn.refs.push(entry.ref)
    turn.newest = Number.isNaN(turn.newest)
      ? created
      : Number.isNaN(created)
        ? turn.newest
        : Math.max(turn.newest, created)
    byTurn.set(parsed.turnId, turn)
  }
  if (byTurn.size <= options.keepTurns) {
    return 0
  }
  // Ties (same-second saves) fall back to the id so pruning stays deterministic.
  const ordered = [...byTurn.entries()].sort(
    (a, b) => b[1].newest - a[1].newest || a[0].localeCompare(b[0])
  )
  const doomed = ordered.slice(options.keepTurns).flatMap(([, turn]) => turn.refs)
  if (doomed.length === 0) {
    return 0
  }
  await deleteCheckpoints(cwd, {
    refs: doomed,
    ...(options.runtime ? { runtime: options.runtime } : {})
  })
  return doomed.length
}
