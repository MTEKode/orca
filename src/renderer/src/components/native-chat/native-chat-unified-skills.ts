import type { DiscoveredSkill } from '../../../../shared/skills'
import type { UnifiedCatalogSkill } from '../../../../shared/skills/unified-skill-catalog'
import { unifiedCatalogPickerSkills } from '../../../../shared/native-chat/input/native-chat-skill-visibility'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import type { NativeChatSkillDiscoveryContext } from './composer/pickers/native-chat-skill-discovery-context'

const UNIFIED_CATALOG_TIMEOUT_MS = 10_000

/** The catalog is additive: a host without it (older runtime, WSL) just lists nothing extra. */
export async function loadNativeChatUnifiedSkills(
  context: NativeChatSkillDiscoveryContext
): Promise<DiscoveredSkill[]> {
  try {
    const result = await callRuntimeRpc<{ skills?: UnifiedCatalogSkill[] }>(
      context.runtimeTarget,
      'skills.unifiedCatalog',
      { repoPath: context.cwd },
      { timeoutMs: UNIFIED_CATALOG_TIMEOUT_MS }
    )
    return Array.isArray(result?.skills) ? unifiedCatalogPickerSkills(result.skills) : []
  } catch {
    return []
  }
}
