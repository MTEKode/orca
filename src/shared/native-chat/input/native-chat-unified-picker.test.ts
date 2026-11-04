import { describe, expect, it } from 'vitest'
import { deriveComposerAutocomplete } from '../../native-chat-composer-autocomplete'
import { unifiedCatalogPickerSkills } from '../../native-chat-skill-visibility'
import { getNativeChatAgentProfile } from '../native-chat-agent-profiles'
import type { AgentType } from '../../agent-status-types'
import type { SlashCommandSuggestion } from './native-chat-slash-commands'

const unifiedSkills = unifiedCatalogPickerSkills([
  {
    name: 'deploy',
    description: 'Ship it',
    directoryPath: '/repo/.agents/skills/deploy',
    source: 'project'
  },
  {
    name: 'review',
    description: 'Unified review',
    directoryPath: '/h/.agents/skills/review',
    source: 'installed'
  }
])

function slashItems(
  agent: AgentType,
  commands: SlashCommandSuggestion[],
  sessionSkills?: { name: string; description?: string; path?: string }[]
) {
  const result = deriveComposerAutocomplete(
    '/',
    1,
    commands,
    [],
    getNativeChatAgentProfile(agent),
    { status: 'ready', skills: [], unifiedSkills },
    null,
    sessionSkills
  )
  return result.mode === 'slash' ? result.items : []
}

describe('unified catalog in the / picker', () => {
  it.each(['claude', 'codex', 'opencode'] as const)('lists the catalog for %s', (agent) => {
    const names = slashItems(agent, [], agent === 'opencode' ? undefined : []).flatMap((item) =>
      item.kind === 'skill' ? [item.name] : []
    )
    expect(names).toEqual(expect.arrayContaining(['deploy', 'review']))
  })

  it('lets the unified entry win over a same-named reported skill', () => {
    const items = slashItems(
      'claude',
      [],
      [{ name: 'deploy', description: 'Harness deploy', path: '/elsewhere/deploy/SKILL.md' }]
    )
    const deploys = items.filter((item) => item.name === 'deploy')
    expect(deploys).toHaveLength(1)
    expect(deploys[0]).toMatchObject({ kind: 'skill', description: 'Ship it' })
  })

  it('keeps a harness-native command that shares a name with a catalog skill', () => {
    const items = slashItems('claude', [{ name: 'review', description: 'Review changes' }], [])
    expect(items.filter((item) => item.name === 'review').map((item) => item.kind)).toEqual([
      'command'
    ])
  })
})
