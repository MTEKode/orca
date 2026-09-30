export type WorkspaceSymbolCandidate = {
  name: string
  kind: number
  containerName: string | null
  uri: string
  line: number
  character: number
}

// LSP SymbolKind: Module 2, Class 5, Method 6, Enum 10, Interface 11, Function 12, Constant 14, Struct 23.
const DEFINITION_KINDS = new Set([2, 5, 6, 10, 11, 12, 14, 23])
const DEPENDENCY_PATH = /\/(node_modules|vendor|\.bundle|gems)\//

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function splitSymbolToken(token: string): { name: string; container: string | null } {
  const parts = token.replace(/[?!]$/, '').split(/::|#|\./)
  const name = parts.pop() ?? token
  return { name, container: parts.length > 0 ? parts.join('::') : null }
}

export function toWorkspaceSymbolCandidates(result: unknown): WorkspaceSymbolCandidate[] {
  if (!Array.isArray(result)) {
    return []
  }
  const candidates: WorkspaceSymbolCandidate[] = []
  for (const item of result) {
    if (
      !isRecord(item) ||
      typeof item.name !== 'string' ||
      typeof item.kind !== 'number' ||
      !isRecord(item.location)
    ) {
      continue
    }
    const { uri, range } = item.location
    if (typeof uri !== 'string') {
      continue
    }
    const start = isRecord(range) && isRecord(range.start) ? range.start : null
    candidates.push({
      name: item.name,
      kind: item.kind,
      containerName: typeof item.containerName === 'string' ? item.containerName : null,
      uri,
      line: typeof start?.line === 'number' ? start.line : 0,
      character: typeof start?.character === 'number' ? start.character : 0
    })
  }
  return candidates
}

function shortName(name: string): string {
  return name.split('::').pop() ?? name
}

export function rankWorkspaceSymbols(
  token: string,
  candidates: WorkspaceSymbolCandidate[],
  worktreePath: string
): WorkspaceSymbolCandidate[] {
  const { name, container } = splitSymbolToken(token)
  const root = worktreePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const score = (candidate: WorkspaceSymbolCandidate): number => {
    const path = decodeURIComponent(candidate.uri.replace(/^file:\/\//, ''))
      .replace(/\\/g, '/')
      .toLowerCase()
    const qualified = candidate.containerName
      ? `${candidate.containerName}::${shortName(candidate.name)}`
      : candidate.name
    let total = 0
    if (
      container &&
      (qualified.endsWith(`${container}::${name}`) || candidate.containerName?.endsWith(container))
    ) {
      total += 4
    }
    // Why: a class in a vendored gem must not outrank a plain symbol in the project.
    if (DEFINITION_KINDS.has(candidate.kind) && !DEPENDENCY_PATH.test(path)) {
      total += 2
    }
    if (path.includes(root) && !DEPENDENCY_PATH.test(path)) {
      total += 2
    }
    return total
  }
  return candidates
    .filter((candidate) => shortName(candidate.name) === name)
    .map((candidate) => ({ candidate, total: score(candidate) }))
    .sort((a, b) => b.total - a.total)
    .map(({ candidate }) => candidate)
}
