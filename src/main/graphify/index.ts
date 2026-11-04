import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import {
  build,
  update,
  hookQuit,
  getLastError,
  runningKind,
  setLastError,
  type RunResult,
  type RunnerDeps
} from './runner'
import { graphHtmlPath, readGraphStatus, type GraphStatus } from './storage'
import { readGoogleAiKey } from './google-ai-secret'

export { cancel, getGraphifyLog } from './runner'
export { maybeAutoUpdate } from './auto-update'
export { clearGoogleAiKey, writeGoogleAiKey } from './google-ai-secret'

const listeners = new Set<(repoId: string) => void>()
/** Runtime construction subscribes once and republishes as the `graphifyChanged` client event. */
export function subscribeGraphifyChanged(listener: (repoId: string) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const emitChanged = (repoId: string): void => listeners.forEach((l) => l(repoId))

const deps: RunnerDeps = { onChanged: emitChanged }

function finish(repoId: string, r: RunResult): void {
  // Skipped updates (another job running) must not clobber the running job's error state.
  if (!r.skipped) {
    setLastError(repoId, r.ok || r.error === 'cancelled' ? undefined : r.error)
  }
  emitChanged(repoId)
}

export type FullGraphStatus = GraphStatus & {
  running: 'build' | 'update' | null
  googleAiKeySet: boolean
  error?: string
}
export function readFullStatus(repoId: string): FullGraphStatus {
  const error = getLastError(repoId)
  return {
    ...readGraphStatus(repoId),
    running: runningKind(repoId),
    googleAiKeySet: readGoogleAiKey() !== null,
    ...(error ? { error } : {})
  }
}

/** Fire-and-forget: the RPC returns immediately and clients follow progress via graphifyChanged/log. */
export function startBuild(p: { repoId: string; repoRoot: string; deep?: boolean }): void {
  hookQuit()
  void build(p, deps).then((r) => finish(p.repoId, r))
}
export function startUpdate(p: { repoId: string; repoRoot: string }): void {
  hookQuit()
  void update(p, deps).then((r) => finish(p.repoId, r))
}

export function viewerUrl(repoId: string): string {
  if (!existsSync(graphHtmlPath(repoId))) {
    throw new Error('No graph viewer yet; run a graph build first.')
  }
  return pathToFileURL(graphHtmlPath(repoId)).href
}
