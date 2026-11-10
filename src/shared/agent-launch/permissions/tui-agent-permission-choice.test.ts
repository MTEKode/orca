import * as reconciliation from '../choices/agent-choice-reconciliation'
import { getDefaultSettings } from '../../constants'
import { legacyChatPermissionWrite } from '../../../main/persistence/applying-settings/legacy-chat-permission-write'
import { measureSettingsWork } from '../../global-settings-test-fixture'
import { legacyLaunchTextUpdates } from '../choices/agent-launch-permission-updates'
import { describe, expect, it, vi } from 'vitest'
import {
  agentLaunchSettingsMutationUpdates,
  type AgentLaunchSettingsSource
} from '../choices/agent-launch-settings'
import { newChatPermissionModeForSettings } from './agent-chat-permission-mode'
import {
  DEFAULT_TUI_AGENT_ARGS,
  DEFAULT_TUI_AGENT_ENV,
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../choices/tui-agent-launch-defaults'
import { applyAllAgentsPermission, resolveAgentPermission } from './tui-agent-permission-choice'
import { migrateAgentPermissionChoice } from './tui-agent-permission-lift'

const legacy = (
  args: Record<string, string>,
  env: Record<string, Record<string, string>> = {}
): AgentLaunchSettingsSource => ({
  agentDefaultArgs: { ...DEFAULT_TUI_AGENT_ARGS, ...args },
  agentDefaultEnv: { ...DEFAULT_TUI_AGENT_ENV, ...env }
})

describe('one-time move of permission flags out of Arguments', () => {
<<<<<<< HEAD
  it('lifts the canonical read-only Codex Ask and uses it for stored Ask choices', () => {
    const recipe = '-a on-request -s read-only -c approvals_reviewer=user'
    expect(agentPermissionArgs('codex', 'ask')).toBe(recipe)
    expect(liftAgentPermissionArgs('codex', `${recipe} --search`)).toEqual({
      choice: 'ask',
      args: '--search'
    })
    expect(resolveTuiAgentLaunchArgs('codex', { agentPermissionDefault: 'ask' })).toBe(recipe)
  })

  it('turns saved shapes into a stored choice and leaves the rest of the text', () => {
    const migrated = migrateAgentPermissionChoice(
      legacy(
        {
          claude: '--model opus --dangerously-skip-permissions',
          codex: '--approve-for-me -c model_reasoning_effort="high"',
          gemini: '',
          // Not one of Orca's flags: left whole, and Orca adds nothing.
          grok: '--permission-mode plan'
        },
        { goose: { goose_mode: 'auto', OTHER: '1' } }
      ),
      'win32'
    )
    expect(migrated.agentPermissionDefault).toBe('full-access')
    expect(migrated.agentDefaultArgs).toMatchObject({
      claude: '',
      codex: '',
      gemini: '',
      grok: '--permission-mode plan',
      cursor: ''
    })
    // Windows reads env names case-insensitively; unrelated entries stay.
    expect(migrated.agentDefaultEnv.goose).toEqual({ OTHER: '1' })
    expect(migrated.agentPermissionOverrides).toEqual({
      codex: 'auto',
      gemini: 'own',
      grok: 'own',
      opencode: 'own',
      omp: 'own'
    })
    // Terminals launch what they launched before the move.
    expect(resolveTuiAgentLaunchArgs('claude', migrated)).toBe(
      '--model opus --dangerously-skip-permissions'
    )
    expect(resolveTuiAgentLaunchArgs('grok', migrated)).toBe('--permission-mode plan')
    expect(resolveTuiAgentLaunchEnv('goose', migrated)).toEqual({ GOOSE_MODE: 'auto', OTHER: '1' })
  })

=======
>>>>>>> upstream/main
  it('cuts a flag beside quoted text, and leaves a quoted flag as the user’s own text', () => {
    const migrated = migrateAgentPermissionChoice(
      legacy({ claude: '--name "a b" --dangerously-skip-permissions' })
    )
    expect(migrated.agentDefaultArgs.claude).toBe('--name "a b"')
    const quoted = migrateAgentPermissionChoice(
      legacy({ claude: '"--dangerously-skip-permissions"' })
    )
    expect(quoted.agentPermissionOverrides.claude).toBe('own')
    expect(quoted.agentDefaultArgs.claude).toBe('"--dangerously-skip-permissions"')
  })
})

it.each(['typed', 'legacy', 'chat'] as const)(
  'keeps migration-owned and hand-set choices across global writes (%s)',
  (path) => {
    const settings = {
      ...getDefaultSettings('/synthetic'),
      ...migrateAgentPermissionChoice(legacy({ gemini: '', grok: '' }))
    }
    settings.agentPermissionOverrides.codex = 'ask'
    const original = { ...settings.agentPermissionOverrides }
    expect(Object.values(original).filter((value) => value === 'own').length).toBeGreaterThan(1)
    for (const choice of ['ask', 'auto', 'auto', 'full-access'] as const) {
      const mode = choice === 'ask' ? 'manual' : choice === 'auto' ? 'auto' : 'yolo'
      const before = { ...settings.agentPermissionOverrides }
      Object.assign(
        settings,
        path === 'chat'
          ? legacyChatPermissionWrite(settings, { nativeChatPermissionMode: choice })
          : agentLaunchSettingsMutationUpdates(
              settings,
              path === 'legacy' ? { type: 'permissions', mode } : { type: 'permission', choice },
              'linux'
            )
      )
      expect(settings.agentPermissionOverrides).toMatchObject(original)
      expect(settings.agentPermissionOverrides).toMatchObject(before)
    }
    expect(
      applyAllAgentsPermission({ agentPermissionDefault: 'auto' }, 'auto').agentPermissionOverrides
    ).toEqual({})
    expect(() =>
      agentLaunchSettingsMutationUpdates(
        settings,
        { type: 'permission', agent: 'gemini', choice: 'ask' },
        'linux'
      )
    ).toThrow('This agent does not offer that permission')
  }
)

describe('older clients against a host with the stored choice', () => {
  const host = {
    ...migrateAgentPermissionChoice(legacy({ codex: '--approve-for-me --search' })),
    nativeChatPermissionMode: 'ask'
  } satisfies AgentLaunchSettingsSource

  it('deleting the published flag means the agent’s own settings; another flag becomes the choice', () => {
    const deleted = agentLaunchSettingsMutationUpdates(
      host,
      { type: 'arguments', agent: 'codex', value: '--search' },
      'linux'
    )
    expect(resolveAgentPermission('codex', { ...host, ...deleted }).choice).toBe('own')
    const swapped = agentLaunchSettingsMutationUpdates(
      host,
      {
        type: 'arguments',
        agent: 'codex',
        value: '--dangerously-bypass-approvals-and-sandbox --search'
      },
      'linux'
    )
    expect({ ...host, ...swapped }.agentDefaultArgs?.codex).toBe('--search')
    expect(resolveAgentPermission('codex', { ...host, ...swapped }).choice).toBe('full-access')
    const manual = agentLaunchSettingsMutationUpdates(
      host,
      { type: 'permissions', mode: 'manual', agent: 'claude' },
      'linux'
    )
    expect(resolveTuiAgentLaunchArgs('claude', { ...host, ...manual })).toBe('')
  })
})

describe('permission carrier ownership across save, reload and consumers', () => {
  it('applies combined old-client carrier edits against the original projection', () => {
    const host: AgentLaunchSettingsSource = {
      agentPermissionDefault: 'full-access',
      agentDefaultEnv: { goose: { KEEP: '1' } }
    }
    const updated = {
      ...host,
      ...legacyLaunchTextUpdates(
        host,
        {
          agentDefaultArgs: { goose: '--model foo', claude: '--permission-mode auto --model opus' },
          agentDefaultEnv: { goose: { GOOSE_MODE: 'auto', KEEP: '2' } }
        },
        'linux'
      )
    }
    expect(resolveTuiAgentLaunchEnv('goose', updated, 'linux')).toEqual({
      GOOSE_MODE: 'auto',
      KEEP: '2'
    })
    expect(resolveTuiAgentLaunchArgs('goose', updated)).toBe('--model foo')
    expect(newChatPermissionModeForSettings('claude', updated)).toBe('auto')
    expect(updated.agentDefaultArgs?.claude).toBe('--model opus')
  })

  it('uses host environment identity without guessing duplicate Windows values', () => {
    const raw = legacy({}, { goose: { goose_mode: 'auto', KEEP: '1' } })
    const posix = migrateAgentPermissionChoice(raw, 'linux')
    expect(resolveTuiAgentLaunchEnv('goose', posix, 'linux')).toEqual({
      goose_mode: 'auto',
      KEEP: '1'
    })
    const explicit = { ...posix, agentPermissionOverrides: { goose: 'full-access' as const } }
    expect(resolveTuiAgentLaunchEnv('goose', explicit, 'linux')).toEqual({
      GOOSE_MODE: 'auto',
      goose_mode: 'auto',
      KEEP: '1'
    })
    const unknown = migrateAgentPermissionChoice(raw, null)
    expect(unknown.agentDefaultEnv.goose).toEqual({ goose_mode: 'auto', KEEP: '1' })
    const windows = migrateAgentPermissionChoice(raw, 'win32')
    expect(resolveTuiAgentLaunchEnv('goose', windows, 'win32')).toEqual({
      GOOSE_MODE: 'auto',
      KEEP: '1'
    })
    const duplicate = migrateAgentPermissionChoice(
      legacy({}, { goose: { GOOSE_MODE: 'auto', goose_mode: 'approve' } }),
      'win32'
    )
    expect(resolveAgentPermission('goose', duplicate).choice).toBe('own')
    expect(resolveTuiAgentLaunchEnv('goose', duplicate, 'win32')).toEqual({
      GOOSE_MODE: 'auto',
      goose_mode: 'approve'
    })
  })
<<<<<<< HEAD

  it('migrates agents without terminal flags to own, then retains explicit chat choices through Auto', () => {
    const agents = ['antigravity', 'opencode', 'omp'] as const
    const upgraded = {
      ...migrateAgentPermissionChoice(legacy({})),
      nativeChatPermissionMode: 'ask' as const
    }
    for (const agent of ['opencode', 'omp'] as const) {
      expect(newChatPermissionModeForSettings(agent, upgraded)).toBe('own')
    }
    const ask = { ...upgraded, ...applyAllAgentsPermission(upgraded, 'ask') }
    for (const agent of agents) {
      const expected = agent === 'antigravity' ? 'ask' : 'own'
      expect(resolveTuiAgentLaunchArgs(agent, ask)).toBe('')
      expect(newChatPermissionModeForSettings(agent, ask)).toBe(expected)
      const edited = {
        ...ask,
        ...agentLaunchSettingsMutationUpdates(
          ask,
          { type: 'arguments', agent, value: '--model foo' },
          'linux'
        )
      }
      expect(newChatPermissionModeForSettings(agent, edited)).toBe(expected)
    }
    const own = { ...ask, agentPermissionOverrides: { omp: 'own' as const } }
    const auto = { ...own, ...applyAllAgentsPermission(own, 'auto') }
    expect(resolveAgentPermission('omp', auto).choice).toBe('own')
    for (const agent of ['antigravity', 'opencode'] as const) {
      expect(newChatPermissionModeForSettings(agent, auto)).toBe('ask')
    }
  })
=======
>>>>>>> upstream/main
})

const importWork = { chars: 0, visits: 0 }
const reconcile = reconciliation.reconcileAgentChoiceArgs
vi.spyOn(reconciliation, 'reconcileAgentChoiceArgs').mockImplementation((input) => {
  const { userArgs: text } = input
  const { value, work } = measureSettingsWork(() => reconcile(input))
  importWork.chars += work.chars
  importWork.visits += work.visits
  if (text.length < 100) {
    return value
  }
  const calls = work.inputs,
    w = 8,
    t = text.split(' ').length
  expect(calls.filter((v) => v === text)).toHaveLength(3)
  // Fixed token/span/owner allowance plus native slices and two B construction passes per candidate.
  for (const [actual, bound] of [
    [calls.filter((v) => v.length > 100 && v !== text).length, 3 * (w + 1)],
    [work.chars, 3 * (w + 2) * text.length + 4096],
    [work.entries + work.visits, 3 * (2 + 10 * (w + 1)) * (t + w) + 4096],
    [work.bytes + 2 * (w + 1) * text.length, 12 * (w + 1) * text.length + 4096]
  ]) {
    expect(actual).toBeLessThanOrEqual(bound)
  }
  return value
})
