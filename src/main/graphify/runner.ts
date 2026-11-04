import { spawnProcess } from '@orca/process-host'
import { mkdirSync } from 'node:fs'
import { getAppEnvironment } from '../../shared/app-environment'
import { ensureGraphify } from './install'
import { readGoogleAiKey } from './google-ai-secret'
import { graphDirForRepo, graphOutDir } from './storage'

const LOG_LINES = 500
export type GraphifyJob = {
  repoId: string
  repoRoot: string
  kind: 'build' | 'update'
  deep?: boolean
}

type ChildProcess = ReturnType<typeof spawnProcess>
type SpawnOpts = { cwd?: string; env?: NodeJS.ProcessEnv; stdio?: ['ignore', 'pipe', 'pipe'] }
type Spawn = (bin: string, args: string[], opts: SpawnOpts) => ChildProcess
const defaultSpawn: Spawn = (bin, args, opts) =>
  spawnProcess({ program: bin, args, cwd: opts.cwd, env: opts.env })
export type RunnerDeps = {
  spawn?: Spawn
  ensure?: () => Promise<string>
  googleKey?: () => string | null
  onChanged?: (repoId: string) => void
}

const logs = new Map<string, string[]>()
const pushLog = (repoId: string, line: string): void => {
  const buf = logs.get(repoId) ?? []
  buf.push(line)
  if (buf.length > LOG_LINES) {
    buf.shift()
  }
  logs.set(repoId, buf)
}
export const getGraphifyLog = (repoId: string): string[] => [...(logs.get(repoId) ?? [])]

/** Env for the child: inherit, drop any ambient provider keys, add GEMINI_API_KEY only from our stored secret. */
export function buildGraphifyEnv(repoId: string, key: string | null): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GRAPHIFY_OUT: graphOutDir(repoId) }
  delete env.GEMINI_API_KEY
  delete env.GOOGLE_API_KEY
  if (key) {
    env.GEMINI_API_KEY = key
  }
  return env
}

let current: Slot | null = null
// ponytail: one global slot + in-order queue of builds; no priorities. Updates never queue.
const queue: { job: GraphifyJob; resolve: (r: RunResult) => void }[] = []
export type RunResult = { ok: boolean; skipped?: boolean; error?: string }

const lastErrors = new Map<string, string>()
export function setLastError(repoId: string, error: string | undefined): void {
  if (error) {
    lastErrors.set(repoId, error)
  } else {
    lastErrors.delete(repoId)
  }
}
export const getLastError = (repoId: string): string | undefined => lastErrors.get(repoId)
export const runningKind = (repoId: string): 'build' | 'update' | null =>
  current?.job.repoId === repoId ? current.job.kind : null

export const runningRepoId = (): string | null => current?.job.repoId ?? null

export function cancel(repoId?: string): boolean {
  if (!current || (repoId && current.job.repoId !== repoId)) {
    return false
  }
  current.cancelled = true
  current.child?.kill('SIGTERM')
  return true
}

type Slot = { job: GraphifyJob; child: ChildProcess | null; cancelled: boolean }
async function runStep(
  bin: string,
  args: string[],
  job: GraphifyJob,
  slot: Slot,
  key: string | null,
  deps: RunnerDeps
): Promise<number | null> {
  const child = (deps.spawn ?? defaultSpawn)(bin, args, {
    cwd: graphDirForRepo(job.repoId),
    env: buildGraphifyEnv(job.repoId, key),
    stdio: ['ignore', 'pipe', 'pipe']
  })
  slot.child = child
  for (const stream of [child.stdout, child.stderr]) {
    let rest = ''
    stream?.on('data', (chunk: Buffer) => {
      const lines = (rest + chunk.toString('utf8')).split('\n')
      rest = lines.pop() ?? ''
      lines.forEach((l) => pushLog(job.repoId, l))
    })
  }
  return new Promise((res, rej) => {
    child.once('error', rej)
    child.once('close', res)
  })
}

async function execute(job: GraphifyJob, deps: RunnerDeps): Promise<RunResult> {
  const slot: Slot = { job, child: null, cancelled: false }
  current = slot
  deps.onChanged?.(job.repoId)
  try {
    const bin = await (deps.ensure ?? ensureGraphify)()
    mkdirSync(graphOutDir(job.repoId), { recursive: true })
    const key = job.kind === 'build' ? (deps.googleKey ?? readGoogleAiKey)() : null
    const args =
      job.kind === 'build'
        ? ['extract', job.repoRoot, '--out', graphDirForRepo(job.repoId), '--force']
        : ['update', job.repoRoot]
    if (job.kind === 'build' && key) {
      args.push('--backend', 'gemini', ...(job.deep ? ['--mode', 'deep'] : []))
    } else if (job.kind === 'build') {
      args.push('--code-only')
    }
    // Why: extract writes graph.json only; cluster-only adds graph.html + report (no LLM with --no-label).
    const steps =
      job.kind === 'build'
        ? [args, ['cluster-only', graphDirForRepo(job.repoId), '--no-label']]
        : [args]
    let code: number | null = 0
    for (const stepArgs of steps) {
      code = await runStep(bin, stepArgs, job, slot, key, deps)
      if (code !== 0 || slot.cancelled) {
        break
      }
    }
    if (slot.cancelled) {
      return { ok: false, error: 'cancelled' }
    }
    return code === 0 ? { ok: true } : { ok: false, error: `graphify exited with code ${code}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    pushLog(job.repoId, message)
    return { ok: false, error: message }
  } finally {
    current = null
    deps.onChanged?.(job.repoId)
    const next = queue.shift()
    if (next) {
      void execute(next.job, deps).then(next.resolve)
    }
  }
}

/** Runs one graphify job at a time globally. Builds queue behind a running job; updates are skipped. */
export function enqueue(job: GraphifyJob, deps: RunnerDeps = {}): Promise<RunResult> {
  if (!current) {
    return execute(job, deps)
  }
  if (job.kind === 'update') {
    return Promise.resolve({ ok: true, skipped: true })
  }
  return new Promise((resolve) => queue.push({ job, resolve }))
}

export const build = (
  p: { repoId: string; repoRoot: string; deep?: boolean },
  deps?: RunnerDeps
): Promise<RunResult> => enqueue({ ...p, kind: 'build' }, deps)
export const update = (
  p: { repoId: string; repoRoot: string },
  deps?: RunnerDeps
): Promise<RunResult> => enqueue({ ...p, kind: 'update' }, deps)

let quitHooked = false
export function hookQuit(): void {
  if (!quitHooked) {
    quitHooked = true
    getAppEnvironment().onWillQuit(() => {
      queue.length = 0
      cancel()
    })
  }
}
