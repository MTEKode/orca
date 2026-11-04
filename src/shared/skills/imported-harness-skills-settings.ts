/** Skills from other agent harnesses linked into ~/.agents/skills; `selected` holds `<origin>:<dir>` ids. */
export type ImportedHarnessSkillsSettings = {
  importedHarnessSkills?: { enabled: boolean; selected: string[] }
}
