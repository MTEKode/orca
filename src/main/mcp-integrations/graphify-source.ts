import { existsSync } from 'node:fs'
import { graphDirForRepo, graphJsonPath } from '../graphify/storage'
import { childEnv, type StdioTransportCtor } from './stdio-transport'
import type { McpToolResult, McpTransportLike } from './sdk'

export type GraphRef = { graphJson: string; projectDir: string }
/** Where built graphs live; injected so the hub stays testable without userData. */
export type GraphifyAccess = { find(repoId: string): GraphRef | null; any(): GraphRef | null }

export const NO_GRAPH_TEXT =
  'No knowledge graph for this repo yet. Run `orca graph build` (or use the Graph panel) and retry.'
export const NO_ANY_GRAPH_TEXT =
  'No graphs built yet. Build one from the Graph panel or `orca graph build`.'

export function createGraphifyAccess(listRepoIds: () => string[]): GraphifyAccess {
  const find = (repoId: string): GraphRef | null =>
    existsSync(graphJsonPath(repoId))
      ? { graphJson: graphJsonPath(repoId), projectDir: graphDirForRepo(repoId) }
      : null
  return {
    find,
    any: () => {
      for (const id of listRepoIds()) {
        const ref = find(id)
        if (ref) {
          return ref
        }
      }
      return null
    }
  }
}

/** One shared server answers for every repo: each call carries project_path (see prepareGraphifyCall). */
export function buildGraphifyTransport(
  Transport: StdioTransportCtor,
  graphJson: string
): McpTransportLike {
  const env = childEnv()
  // Why: serve resolves project_path as <dir>/<GRAPHIFY_OUT>/graph.json; an override would break that.
  delete env.GRAPHIFY_OUT
  return new Transport({
    command: 'uv',
    args: ['tool', 'run', '--from', 'graphifyy[mcp]', 'python', '-m', 'graphify.serve', graphJson],
    cwd: process.cwd(),
    env
  })
}

const errorResult = (text: string): McpToolResult => ({
  content: [{ type: 'text', text }],
  isError: true
})

/** Injects project_path (overriding any caller value) or returns the no-graph error without spawning. */
export function guardGraphifyCall(
  access: GraphifyAccess,
  repoId: string | null | undefined,
  args: Record<string, unknown>
):
  | { args: Record<string, unknown>; error?: undefined }
  | { args?: undefined; error: McpToolResult } {
  const ref = repoId ? access.find(repoId) : null
  return ref
    ? { args: { ...args, project_path: ref.projectDir } }
    : { error: errorResult(NO_GRAPH_TEXT) }
}
