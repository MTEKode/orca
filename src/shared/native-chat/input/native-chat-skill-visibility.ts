import type { AgentType } from '../../agent-status/contracts/agent-status-types'
import type { AgentSessionSlashCommand } from '../../agent-session/agent-session-wire'
import type { DiscoveredSkill, SkillDiscoveryResult, SkillSourceKind } from '../../skills'
import type { UnifiedCatalogSkill, UnifiedSkillSource } from '../../skills/unified-skill-catalog'
import { getNativeChatAgentProfile, readsSkillSource } from '../native-chat-agent-profiles'
import { classifyPickerCommands } from './native-chat-picker-items'
import {
  sessionReportedSkills,
  type NativeChatSessionSkill,
  type SlashCommandSuggestion
} from './native-chat-slash-commands'
import { isStructuredAgentSessionComposerCommand } from '../../agent-session/view/structured-agent-session-composer'

export function isNativeChatSkillForAgent(
  agent: AgentType,
  skill: DiscoveredSkill,
  result?: Pick<SkillDiscoveryResult, 'sources'>
): boolean {
  const profile = getNativeChatAgentProfile(agent)
  if (!profile) {
    return false
  }
  if (!result) {
    return (
      agent === 'codex' &&
      (skill.providers.includes('codex') || skill.providers.includes('agent-skills'))
    )
  }
  // Canonical dedup may hide alternate symlink roots; any shared/agent root grants visibility regardless of scan order.
  const rootPaths = skill.rootPaths?.length ? skill.rootPaths : [skill.rootPath]
  return rootPaths.some((rootPath) => {
    const source = result.sources.find((entry) => entry.path === rootPath)
    return source !== undefined && readsSkillSource(profile, source)
  })
}

/** Skills the session reported; undefined keeps the host disk scan (also for chats that keep scanned skills). */
export function nativeChatSessionSkills(
  agent: AgentType,
  reported: readonly AgentSessionSlashCommand[] | undefined
): readonly NativeChatSessionSkill[] | undefined {
  const keepsScannedSkills = getNativeChatAgentProfile(agent)?.keepsScannedSkills === true
  return reported !== undefined && !keepsScannedSkills
    ? sessionReportedSkills(reported, agent)
    : undefined
}

export function nativeChatPickerCommands(
  agent: AgentType,
  commands: readonly SlashCommandSuggestion[],
  scannedSkills: readonly DiscoveredSkill[]
): readonly SlashCommandSuggestion[] {
  return classifyPickerCommands(commands, scannedSkills, {
    // A chat that keeps scanned skills (OpenCode) may report each as a command too.
    reportMayListSkills: getNativeChatAgentProfile(agent)?.keepsScannedSkills === true,
    isSendCommand: (name) => isStructuredAgentSessionComposerCommand(`/${name}`, agent)
  })
}

const UNIFIED_SOURCE_KIND: Record<UnifiedSkillSource, SkillSourceKind> = {
  project: 'repo',
  bundled: 'bundled',
  installed: 'home'
}

/**
 * Unified-catalog skills are visible to every agent: they bypass `isNativeChatSkillForAgent`
 * (which gates scanned skills by the roots an agent reads) and reach the picker as scanned-shaped rows.
 */
export function unifiedCatalogPickerSkills(
  catalog: readonly UnifiedCatalogSkill[]
): DiscoveredSkill[] {
  return catalog.map((skill) => {
    const separator = skill.directoryPath.includes('\\') ? '\\' : '/'
    const skillFilePath = `${skill.directoryPath.replace(/[\\/]+$/, '')}${separator}SKILL.md`
    return {
      id: `unified:${skill.directoryPath}`,
      name: skill.name,
      description: skill.description,
      providers: [],
      sourceKind: UNIFIED_SOURCE_KIND[skill.source],
      sourceLabel: skill.source,
      rootPath: skill.directoryPath.replace(/[\\/][^\\/]*$/, ''),
      directoryPath: skill.directoryPath,
      skillFilePath,
      installed: true,
      updatedAt: null
    }
  })
}
