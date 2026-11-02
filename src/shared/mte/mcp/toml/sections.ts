// Vendored from src/main/codex/config-toml-runtime-owned-sections.ts @ 4d8e8b889f (only the section helpers the mte MCP planner uses).

import { parseTomlTableHeaderPath } from './key-path'
import {
  createTomlLineScanState,
  getTomlTableHeader,
  isTomlStructuralLine,
  updateTomlLineScanState
} from './line-scan'

export type TomlSection = {
  header: string
  block: string
  start: number
}

export function getTomlSections(config: string): TomlSection[] {
  const lines = config.split('\n')
  const sections: TomlSection[] = []
  let sectionStart = -1
  let sectionHeader: string | null = null
  let scanState = createTomlLineScanState()

  for (let index = 0; index < lines.length; index += 1) {
    const header = isTomlStructuralLine(scanState) ? getTomlTableHeader(lines[index] ?? '') : null
    if (!header) {
      scanState = updateTomlLineScanState(scanState, lines[index] ?? '')
      continue
    }

    if (sectionStart !== -1) {
      sections.push({
        header: sectionHeader ?? '',
        block: lines.slice(sectionStart, index).join('\n'),
        start: sectionStart
      })
    }
    sectionStart = index
    sectionHeader = header
    scanState = updateTomlLineScanState(scanState, lines[index] ?? '')
  }

  if (sectionStart !== -1) {
    sections.push({
      header: sectionHeader ?? '',
      block: lines.slice(sectionStart).join('\n'),
      start: sectionStart
    })
  }
  return sections
}

const CODEX_MCP_SERVER_TABLE_ROOT = 'mcp_servers'

export function getMcpServerTomlSectionName(header: string): string | null {
  const table = parseTomlTableHeaderPath(header)
  if (!table || table.isArray || table.segments[0] !== CODEX_MCP_SERVER_TABLE_ROOT) {
    return null
  }
  return table.segments[1] ?? null
}

export function joinTomlBlocks(blocks: string[]): string {
  const normalizedBlocks = blocks.map((block) => block.trim()).filter((block) => block.length > 0)
  return normalizedBlocks.length === 0 ? '' : `${normalizedBlocks.join('\n\n')}\n`
}
