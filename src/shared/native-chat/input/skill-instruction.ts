/**
 * One short block telling the harness how to load a unified-catalog skill.
 * OpenCode does not get the orca-tools MCP server attached in native chat (and exposes MCP tools only
 * through Code Mode), so it is told to use its own skill tool first and fall back to the bundled guide CLI.
 */
export function buildSkillInstruction(name: string, agent?: string): string {
  if (agent === 'opencode') {
    return `Use the "${name}" skill: load it with your own skill tool; if it is not found there, run \`orca skills get ${name} --json\` and follow the returned guide.`
  }
  return `Use the "${name}" skill: call the orca-tools MCP tool orca_skill_read with name "${name}", follow the returned SKILL.md, and read auxiliary files with the same tool when it references them.`
}

/** Appends the instruction below the user's message; blank text yields the instruction alone. */
export function appendSkillInstruction(text: string, name: string, agent?: string): string {
  const trimmed = text.trimEnd()
  const instruction = buildSkillInstruction(name, agent)
  return trimmed ? `${trimmed}\n\n${instruction}` : instruction
}

/** Appends the instruction only when the text still leads with the picked unified-catalog skill token (`/name`). */
export function withPickedSkillInstruction(
  text: string,
  pickedToken: string | null,
  unifiedToken: string | null,
  agent?: string
): string {
  const firstToken = text.split(/\s/, 1)[0] ?? ''
  return pickedToken && pickedToken === unifiedToken && pickedToken === firstToken
    ? appendSkillInstruction(text, pickedToken.slice(1), agent)
    : text
}
