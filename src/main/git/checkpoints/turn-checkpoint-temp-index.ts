// Transient index files under the repo's git dir, so a worktree snapshot never touches the real index.
// Leftovers from hard-killed runs are pruned by later runs: an old mtime plus a dead or missing owner.

import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { addWslEnvKeys } from '../../../shared/wsl-env'
import {
  checkpointHostFsPath,
  runCheckpointGit,
  type TurnCheckpointRuntime
} from './turn-checkpoint-git-run'

const TMP_PARENT_NAME = 'orca-checkpoint-tmp'
const STALE_AFTER_MS = 60 * 60 * 1000

export type CheckpointTempIndex = {
  /** Env carrying GIT_INDEX_FILE at this index, in the view git itself uses. */
  env: NodeJS.ProcessEnv
  dispose: () => Promise<void>
}

function ownerAlive(pidText: string): boolean {
  const pid = Number.parseInt(pidText.trim(), 10)
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function pruneStaleTempDirs(parentFsPath: string, now: number): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(parentFsPath)
  } catch {
    return
  }
  for (const name of entries) {
    const dirFsPath = join(parentFsPath, name)
    try {
      const info = await stat(dirFsPath)
      if (!info.isDirectory() || now - info.mtimeMs <= STALE_AFTER_MS) {
        continue
      }
      const owner = await readFile(join(dirFsPath, 'owner-pid'), 'utf8').catch(() => '')
      if (owner !== '' && ownerAlive(owner)) {
        continue
      }
      await rm(dirFsPath, { recursive: true, force: true })
    } catch {
      // One undeletable leftover must not fail the snapshot that noticed it.
    }
  }
}

/** Create `<gitDir>/orca-checkpoint-tmp/<rand>`; the index path inside it must not pre-exist. */
export async function createCheckpointTempIndex(
  gitDir: string,
  runtime: TurnCheckpointRuntime = {}
): Promise<CheckpointTempIndex> {
  const parentGitPath = `${gitDir}/${TMP_PARENT_NAME}`
  const parentFsPath = checkpointHostFsPath(parentGitPath, runtime.wslDistro)
  await mkdir(parentFsPath, { recursive: true })
  await pruneStaleTempDirs(parentFsPath, Date.now())
  const dirFsPath = await mkdtemp(join(parentFsPath, 'chkpt-'))
  // Pruning proves liveness through this pid; it lands after the directory exists.
  await writeFile(join(dirFsPath, 'owner-pid'), `${process.pid}`, 'utf8')
  const name = basename(dirFsPath)
  const indexGitPath = `${parentGitPath}/${name}/index`
  return {
    env: indexEnv(indexGitPath, runtime),
    dispose: () => rm(dirFsPath, { recursive: true, force: true })
  }
}

function indexEnv(indexGitPath: string, runtime: TurnCheckpointRuntime): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_INDEX_FILE: indexGitPath }
  if (process.platform === 'win32' && runtime.wslDistro) {
    addWslEnvKeys(env, ['GIT_INDEX_FILE'])
  }
  return env
}

const PERSISTENT_INDEX_NAME = 'orca-checkpoint-index'

/** One reusable index per worktree git dir, so unchanged files keep their stat cache across
 *  captures. `dispose` deletes it (and a stale lock) so the next capture rebuilds it. */
export function openPersistentCheckpointIndex(
  gitDir: string,
  runtime: TurnCheckpointRuntime = {}
): CheckpointTempIndex {
  const indexGitPath = `${gitDir}/${PERSISTENT_INDEX_NAME}`
  const indexFsPath = checkpointHostFsPath(indexGitPath, runtime.wslDistro)
  return {
    env: indexEnv(indexGitPath, runtime),
    dispose: async () => {
      await rm(indexFsPath, { force: true })
      await rm(`${indexFsPath}.lock`, { force: true })
    }
  }
}

/** The full working-tree snapshot (tracked + untracked, honoring .gitignore) as one tree object. */
export async function buildCheckpointWorktreeTree(
  cwd: string,
  tempIndex: CheckpointTempIndex,
  options: {
    /** Seed tree whose tracked files survive even when they match .gitignore; null seeds empty. */
    seed: string | null
    runtime?: TurnCheckpointRuntime
  }
): Promise<string> {
  const runtime = options.runtime ?? {}
  const env = tempIndex.env
  if (options.seed !== null) {
    // -m keeps the stat info of unchanged entries (plain read-tree discards it) and drops the rest.
    await runCheckpointGit(cwd, ['read-tree', '-m', options.seed], runtime, { env })
  }
  await runCheckpointGit(cwd, ['add', '-A', '--', '.'], runtime, { env })
  const { stdout } = await runCheckpointGit(cwd, ['write-tree'], runtime, { env })
  return stdout.trim()
}
