export type ImportableSkillOrigin =
  | 'claude-home'
  | 'codex'
  | 'opencode'
  | 'cursor'
  | 'antigravity'
  | 'plugins'
  | 'other'

export const IMPORT_ORIGIN_ORDER: readonly ImportableSkillOrigin[] = [
  'claude-home',
  'codex',
  'opencode',
  'cursor',
  'antigravity',
  'plugins',
  'other'
]

export type ImportableSkillState = 'linked' | 'available' | 'conflict' | 'broken'

export type ImportableSkill = {
  /** Stable `<origin>:<directory name>`; the directory name is also the link name. */
  id: string
  name: string
  description: string | null
  origin: ImportableSkillOrigin
  sourcePath: string
  state: ImportableSkillState
}
