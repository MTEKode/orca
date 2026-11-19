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
      id: 'mimo-code',
      label: translate('auto.lib.agent.catalog.mimo_code_label', 'MiMo Code'),
      cmd: 'mimo',
      homepageUrl: 'https://mimo.xiaomi.com/coder'
    },
    {
      id: 'ante',
      label: translate('auto.lib.agent.catalog.da41abbdd4', 'Ante'),
      cmd: 'ante',
      homepageUrl: 'https://github.com/AntigmaLabs/ante-preview'
    },
    {
      id: 'trae',
      label: translate('auto.lib.agent.catalog.060d152fb5', 'Trae'),
      // Why: matches TUI_AGENT_CONFIG.trae.detectCmd, not the ambiguous `trae-cli` — see the Why there.
      cmd: 'traecli',
      // Why: bare `trae.cn` 404s on Google's favicon service.
      homepageUrl: 'https://docs.trae.cn/cli_get-started-with-trae-cli'
    },
    {
      id: 'muse',
      label: translate('auto.lib.agent.catalog.muse_label', 'Muse'),
      cmd: 'muse',
      homepageUrl: 'https://dev.meta.ai/docs/muse-code'
    },
    {
      id: 'dsh',
      label: translate('auto.lib.agent.catalog.dsh_label', 'DeepSeek Harness'),
      cmd: 'dsh-tui',
      searchAliases: ['deepseek', 'dsh', 'dst', 'deepseek harness'],
      // Why: Orca launches the community dsh-TUI; DeepSeek's site installs only `dsh`, and the unscoped npm `dsh-tui` is a dead prototype.
      homepageUrl: 'https://github.com/ccch1mneyyy/dsh-TUI#quick-start'
    },
    {
      id: 'qoder',
      label: translate('auto.lib.agent.catalog.qoder_label', 'Qoder CLI'),
      cmd: 'qodercli',
      homepageUrl: 'https://docs.qoder.com/cli/overview'
    },
    {
      id: 'qoder-cn',
      label: translate('auto.lib.agent.catalog.qoder_cn_label', 'Qoder CLI China'),
      cmd: 'qoderclicn',
      homepageUrl: 'https://docs.qoder.cn/cli/overview'
    },
    {
      id: 'zcode',
      label: translate('auto.lib.agent.catalog.zcode_label', 'ZCode'),
      cmd: 'zcode',
      homepageUrl: 'https://zcode.z.ai/en/docs'
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
      searchAliases: ['agy'],
      homepageUrl: 'https://antigravity.google/docs/cli-overview'
    }
  ]
}
