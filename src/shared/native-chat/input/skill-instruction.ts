/** One short block telling any harness how to load a unified-catalog skill through the orca-tools MCP server. */
export function buildSkillInstruction(name: string): string {
  return `Use the "${name}" skill: call the orca-tools MCP tool orca_skill_read with name "${name}", follow the returned SKILL.md, and read auxiliary files with the same tool when it references them.`
}

/** Appends the instruction below the user's message; blank text yields the instruction alone. */
export function appendSkillInstruction(text: string, name: string): string {
  const trimmed = text.trimEnd()
  return trimmed ? `${trimmed}\n\n${buildSkillInstruction(name)}` : buildSkillInstruction(name)
}
