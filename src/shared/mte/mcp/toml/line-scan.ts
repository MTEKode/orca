// Vendored from src/main/codex/config-toml-line-scan.ts @ 4d8e8b889f (pure functions used by the mte MCP planner; the packaged CLI cannot import src/main).

export type TomlLineScanState = {
  basic: boolean
  literal: boolean
  arrayDepth: number
}

export type ParsedTomlString = {
  value: string
  start: number
  end: number
}

type TomlMultilineMode = 'basic' | 'literal' | null

export function createTomlLineScanState(): TomlLineScanState {
  return { basic: false, literal: false, arrayDepth: 0 }
}

// Multiline values can contain text resembling headers and assignments.
export function isTomlStructuralLine(state: TomlLineScanState): boolean {
  return !state.basic && !state.literal && state.arrayDepth === 0
}

export function updateTomlLineScanState(state: TomlLineScanState, line: string): TomlLineScanState {
  let mode: TomlMultilineMode = state.basic ? 'basic' : state.literal ? 'literal' : null
  let arrayDepth = state.arrayDepth
  let index = 0
  while (index < line.length) {
    if (mode === 'basic') {
      if (line[index] === '\\') {
        index += 2
        continue
      }
      if (line.startsWith('"""', index)) {
        mode = null
        index += 3
        continue
      }
      index += 1
      continue
    }
    if (mode === 'literal') {
      if (line.startsWith("'''", index)) {
        mode = null
        index += 3
        continue
      }
      index += 1
      continue
    }

    const char = line[index]
    if (char === '#') {
      break
    }
    if (line.startsWith('"""', index)) {
      mode = 'basic'
      index += 3
      continue
    }
    if (line.startsWith("'''", index)) {
      mode = 'literal'
      index += 3
      continue
    }
    if (char === '"') {
      index = skipTomlBasicString(line, index + 1)
      continue
    }
    if (char === "'") {
      index = skipTomlLiteralString(line, index + 1)
      continue
    }
    // Header brackets balance on one line; remaining depth belongs to a multiline array.
    if (char === '[') {
      arrayDepth += 1
      index += 1
      continue
    }
    if (char === ']') {
      arrayDepth = Math.max(0, arrayDepth - 1)
      index += 1
      continue
    }
    index += 1
  }
  return { basic: mode === 'basic', literal: mode === 'literal', arrayDepth }
}

export function getTomlTableHeader(line: string): string | null {
  let index = 0
  while (index < line.length && line[index] !== '#') {
    if (line[index] === '"') {
      index = skipTomlBasicString(line, index + 1)
    } else if (line[index] === "'") {
      index = skipTomlLiteralString(line, index + 1)
    } else {
      index++
    }
  }
  const header = line.slice(0, index).trimEnd()
  return /^\s*\[\[?.+\]\]?$/.test(header) ? header : null
}

export function parseTomlSingleLineStringValue(
  line: string,
  offset: number
): ParsedTomlString | null {
  let index = offset
  while (line[index] === ' ' || line[index] === '\t') {
    index += 1
  }

  if (line.startsWith('"""', index) || line.startsWith("'''", index)) {
    return null
  }

  const quote = line[index]
  if (quote !== '"' && quote !== "'") {
    return null
  }

  const start = index
  index += 1
  let value = ''
  while (index < line.length) {
    const char = line[index]
    if (char === '\n' || char === '\r') {
      return null
    }
    if (char === quote) {
      return { value, start, end: index + 1 }
    }
    if (quote === '"' && char === '\\') {
      const escaped = parseTomlBasicStringEscape(line, index)
      if (!escaped) {
        return null
      }
      value += escaped.value
      index = escaped.nextIndex
      continue
    }
    value += char
    index += 1
  }
  return null
}

function skipTomlBasicString(line: string, startIndex: number): number {
  let index = startIndex
  while (index < line.length) {
    const char = line[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '"') {
      return index + 1
    }
    index += 1
  }
  return index
}

function skipTomlLiteralString(line: string, startIndex: number): number {
  const endIndex = line.indexOf("'", startIndex)
  return endIndex === -1 ? line.length : endIndex + 1
}

function parseTomlBasicStringEscape(
  line: string,
  slashIndex: number
): { value: string; nextIndex: number } | null {
  const escaped = line[slashIndex + 1]
  switch (escaped) {
    case 'b':
      return { value: '\b', nextIndex: slashIndex + 2 }
    case 't':
      return { value: '\t', nextIndex: slashIndex + 2 }
    case 'n':
      return { value: '\n', nextIndex: slashIndex + 2 }
    case 'f':
      return { value: '\f', nextIndex: slashIndex + 2 }
    case 'r':
      return { value: '\r', nextIndex: slashIndex + 2 }
    case '"':
    case '\\':
      return { value: escaped, nextIndex: slashIndex + 2 }
    case 'u':
      return parseTomlUnicodeEscape(line, slashIndex + 2, 4)
    case 'U':
      return parseTomlUnicodeEscape(line, slashIndex + 2, 8)
    default:
      return null
  }
}

function parseTomlUnicodeEscape(
  line: string,
  start: number,
  length: number
): { value: string; nextIndex: number } | null {
  const raw = line.slice(start, start + length)
  if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(raw)) {
    return null
  }
  const codePoint = Number.parseInt(raw, 16)
  // String.fromCodePoint accepts lone surrogates, but TOML requires Unicode scalar values.
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return null
  }
  try {
    return { value: String.fromCodePoint(codePoint), nextIndex: start + length }
  } catch {
    return null
  }
}
