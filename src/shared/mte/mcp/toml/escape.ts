// Vendored from src/main/codex/config-toml-syntax.ts @ 4d8e8b889f (only escapeTomlBasicString, used by the mte MCP planner).

export function escapeTomlBasicString(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\b', '\\b')
    .replaceAll('\f', '\\f')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
}
