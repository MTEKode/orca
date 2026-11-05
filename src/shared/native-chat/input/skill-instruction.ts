/**
 * One short block telling the harness how to load a unified-catalog skill.
 * Every supported native-chat harness receives the orca-tools MCP server attached (or exposes
 * it via Code Mode), so it is told to read the skill through orca_skill_read.
 */
export function buildSkillInstruction(name: string): string {
  return `Use the "${name}" skill: call the orca-tools MCP tool orca_skill_read with name "${name}", follow the returned SKILL.md, and read auxiliary files with the same tool when it references them.`
}

/** Appends the instruction below the user's message; blank text yields the instruction alone. */
export function appendSkillInstruction(text: string, name: string): string {
  const trimmed = text.trimEnd()
  const instruction = buildSkillInstruction(name)
  return trimmed ? `${trimmed}\n\n${instruction}` : instruction
}

/** Appends the instruction only when the text still leads with the picked unified-catalog skill token (`/name`). */
export function withPickedSkillInstruction(
  text: string,
  pickedToken: string | null,
  unifiedToken: string | null
): string {
  const firstToken = text.split(/\s/, 1)[0] ?? ''
  return pickedToken && pickedToken === unifiedToken && pickedToken === firstToken
    ? appendSkillInstruction(text, pickedToken.slice(1))
    : text
}
