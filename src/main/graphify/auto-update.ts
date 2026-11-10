import { existsSync } from 'node:fs'
import { graphJsonPath } from './storage'
import { hookQuit, update, type RunnerDeps } from './runner'

const MIN_INTERVAL_MS = 10 * 60_000
const lastRun = new Map<string, number>()

/** Called when a worktree becomes active: refresh a built graph in the background, at most every 10 minutes. */
export function maybeAutoUpdate(
  p: { repoId: string; repoRoot: string; enabled: boolean | undefined },
  deps?: RunnerDeps,
  now = Date.now()
): boolean {
  if (p.enabled === false) {
    return false
  }
  // Why: throttle first (pure in-memory) and only stat graph.json, never parse it, on the main thread.
  if (now - (lastRun.get(p.repoId) ?? 0) < MIN_INTERVAL_MS) {
    return false
  }
  if (!existsSync(graphJsonPath(p.repoId))) {
    return false
  }
  lastRun.set(p.repoId, now)
  hookQuit()
  // ponytail: "low priority" = deferred + skip-if-busy; no nice(1) on the child.
  setTimeout(() => void update({ repoId: p.repoId, repoRoot: p.repoRoot }, deps), 5_000).unref()
  return true
}
