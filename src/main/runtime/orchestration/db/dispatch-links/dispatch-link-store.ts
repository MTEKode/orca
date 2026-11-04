import type { OrchestrationDb } from '../orchestration-db'

export const DISPATCH_LINKS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS dispatch_links (
  run_id      TEXT NOT NULL,
  dispatch_a  TEXT NOT NULL,
  dispatch_b  TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (run_id, dispatch_a, dispatch_b),
  CHECK(dispatch_a < dispatch_b)
);
`

// Unordered pair stored sorted so (a,b) and (b,a) are one row.
function sorted(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/** Authorizes a worker pair; returns false when the pair was already linked. */
export function linkDispatches(
  this: OrchestrationDb,
  link: { runId: string; a: string; b: string; createdBy: string }
): boolean {
  const [a, b] = sorted(link.a, link.b)
  return (
    this.db
      .prepare(
        'INSERT OR IGNORE INTO dispatch_links (run_id, dispatch_a, dispatch_b, created_by) VALUES (?, ?, ?, ?)'
      )
      .run(link.runId, a, b, link.createdBy).changes > 0
  )
}

/** Revokes a pair; returns false when it was not linked. */
export function unlinkDispatches(
  this: OrchestrationDb,
  link: { runId: string; a: string; b: string }
): boolean {
  const [a, b] = sorted(link.a, link.b)
  return (
    this.db
      .prepare('DELETE FROM dispatch_links WHERE run_id = ? AND dispatch_a = ? AND dispatch_b = ?')
      .run(link.runId, a, b).changes > 0
  )
}

export function areDispatchesLinked(this: OrchestrationDb, a: string, b: string): boolean {
  const [x, y] = sorted(a, b)
  return (
    this.db
      .prepare('SELECT 1 FROM dispatch_links WHERE dispatch_a = ? AND dispatch_b = ?')
      .get(x, y) !== undefined
  )
}

export type DispatchLinkStoreMethods = {
  linkDispatches: typeof linkDispatches
  unlinkDispatches: typeof unlinkDispatches
  areDispatchesLinked: typeof areDispatchesLinked
}

export function attachDispatchLinkStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, { linkDispatches, unlinkDispatches, areDispatchesLinked })
}
