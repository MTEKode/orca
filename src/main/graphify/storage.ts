import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'

export type GraphStatus = {
  state: 'missing' | 'built'
  builtAt: number | null
  nodeCount: number
  edgeCount: number
  semantic: boolean
}

export function graphDirForRepo(repoId: string): string {
  if (!/^[\w.-]+$/.test(repoId) || repoId.startsWith('.')) {
    throw new Error('invalid repo id')
  }
  return join(getAppEnvironment().getPath('userData'), 'graphify', repoId)
}

/** graphify honours GRAPHIFY_OUT (absolute ok); we point it here so the repo tree stays untouched. */
export const graphOutDir = (repoId: string): string => join(graphDirForRepo(repoId), 'graphify-out')
export const graphJsonPath = (repoId: string): string => join(graphOutDir(repoId), 'graph.json')
export const graphHtmlPath = (repoId: string): string => join(graphOutDir(repoId), 'graph.html')

export function readGraphStatus(repoId: string): GraphStatus {
  const file = graphJsonPath(repoId)
  if (!existsSync(file)) {
    return { state: 'missing', builtAt: null, nodeCount: 0, edgeCount: 0, semantic: false }
  }
  let nodes: { _origin?: string; file_type?: string }[] = []
  let edges: unknown[] = []
  try {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: parsed JSON/error shape is checked at this boundary
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    nodes = Array.isArray(raw.nodes) ? raw.nodes : []
    // networkx node-link output uses `links`; older builds used `edges`.
    edges = Array.isArray(raw.links) ? raw.links : Array.isArray(raw.edges) ? raw.edges : []
  } catch {
    // Corrupt/partial file: report built with zero counts rather than throwing from status polls.
  }
  // Why: AST extraction also emits markdown `document` and docstring `rationale` nodes (tagged `_origin: "ast"`), so file_type alone mislabels code-only/update graphs as semantic. Semantic = a non-code/concept node that did not come from the AST pass.
  // ponytail: untagged legacy graphs fall back to the file_type check; revisit if graphify adds a manifest flag.
  const semantic = nodes.some(
    (n) =>
      n._origin !== 'ast' &&
      n.file_type !== undefined &&
      n.file_type !== 'code' &&
      n.file_type !== 'concept'
  )
  return {
    state: 'built',
    builtAt: statSync(file).mtimeMs,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    semantic
  }
}
