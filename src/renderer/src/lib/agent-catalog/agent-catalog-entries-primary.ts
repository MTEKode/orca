import { translate } from '@/i18n/i18n'
import type { AgentCatalogEntry } from './agent-catalog'

/** Keep first-party entries separate from the community tail to stay within module budgets; buildAgentCatalogEntries preserves their order. */
export function primaryAgentCatalogEntries(): AgentCatalogEntry[] {
  return [
    {
      id: 'claude',
      label: translate('auto.lib.agent.catalog.0708ed89f1', 'Claude'),
      cmd: 'claude',
      homepageUrl: 'https://code.claude.com/docs'
    },
    {
      id: 'codex',
      label: translate('auto.lib.agent.catalog.760bc6883d', 'Codex'),
      cmd: 'codex',
      homepageUrl: 'https://github.com/openai/codex'
    },
    {
      id: 'opencode',
      label: translate('auto.lib.agent.catalog.e7a4ca5103', 'OpenCode'),
      cmd: 'opencode',
      homepageUrl: 'https://opencode.ai/docs/cli/'
    },
    {
      id: 'pi',
      label: translate('auto.lib.agent.catalog.302934c5d9', 'Pi'),
      cmd: 'pi',
      homepageUrl: 'https://pi.dev'
    },
    {
      id: 'antigravity',
      label: translate('auto.lib.agent.catalog.691dd11789', 'Antigravity'),
      cmd: 'agy',
      homepageUrl: 'https://antigravity.google/docs/cli-overview'
    }
  ]
}
