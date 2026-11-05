import type { BundledSkillPlan } from '../../../../../shared/bundled-skill-plan'
import { useCallback, useState } from 'react'
import { OrchestrationSkillPromptDialog } from './OrchestrationSkillPromptDialog'
import { buildSkillCommandForRuntime } from '../../../lib/skill-runtime-command'
import { MTE_SKILL_INSTALL_COMMAND } from '@/lib/agent-feature-install-commands'
import { ArrowRightLeft, GitBranch, ListChecks, Workflow, type LucideIcon } from 'lucide-react'
import { MTE_SKILL_NAME } from '@/lib/agent-feature-skill-names'
import type { SkillUsageExample } from '@/lib/skill-usage-example'
import { getMteUsageExamples } from '@/lib/mte-usage-examples'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '@/hooks/useInstalledAgentSkills'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { matchesSettingsSearch } from '../search/settings-search'
import { useAppStore } from '../../../store/index'
import { getMteFlowPaneSearchEntries } from './mte-flow-search'
import { AgentSkillSetupPanel } from '../../skills/setup/AgentSkillSetupPanel'
import { OrchestrationSkillAgentCoverage } from './OrchestrationSkillAgentCoverage'
import { SkillUsageExamplesSection } from '../../skills/examples/SkillUsageExamplesSection'
import { translate } from '@/i18n/i18n'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { resolveNestedWorkerMaxDepth } from '../../../../../shared/nested-worker-depth'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { NumberField } from '../form-controls/SettingsFormControls'
import {
  getNestedWorkerDepthDescription,
  getNestedWorkerDepthTitle
} from './nested-worker-depth-copy'
import { OrchestrationWorkerAutoReleaseSetting } from './OrchestrationWorkerAutoReleaseSetting'

const EXAMPLE_ICONS = {
  handoff: ArrowRightLeft,
  'worktree-handoff': ArrowRightLeft,
  'child-sequence': ListChecks,
  'child-parallel': GitBranch,
  'child-worktrees': Workflow
} as const

function resolveOrchestrationExampleIcon(example: SkillUsageExample): LucideIcon {
  return EXAMPLE_ICONS[example.id as keyof typeof EXAMPLE_ICONS] ?? Workflow
}

type MteFlowPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function MteFlowPane({ settings, updateSettings }: MteFlowPaneProps): React.JSX.Element {
  const [skillPromptOpen, setSkillPromptOpen] = useState(false)
  const searchQuery = useAppStore((s) => s.settingsSearchQuery)
  const showLocalRuntimeSettings = !isPairedWebClientWindow()
  const searchEntries = getMteFlowPaneSearchEntries({
    includeLocalRuntimeSettings: showLocalRuntimeSettings
  })
  const showOrchestration = matchesSettingsSearch(searchQuery, searchEntries)
  const activeSkillRuntime = useActiveProjectSkillRuntime()

  const {
    installed: orchestrationSkillDetected,
    loading: orchestrationSkillLoading,
    error: orchestrationSkillError,
    skills: discoveredSkills,
    sources: discoveredSkillSources,
    refresh: refreshOrchestrationSkill
  } = useInstalledAgentSkill(MTE_SKILL_NAME, {
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })

  const renderCoverage = useCallback(
    (plan: BundledSkillPlan | undefined) =>
      plan || activeSkillRuntime.agentRuntime?.runtime === 'wsl' ? (
        <OrchestrationSkillAgentCoverage
          embedded
          plan={plan}
          skills={discoveredSkills}
          sources={discoveredSkillSources}
          loading={orchestrationSkillLoading}
        />
      ) : null,
    [
      activeSkillRuntime.agentRuntime,
      discoveredSkills,
      discoveredSkillSources,
      orchestrationSkillLoading
    ]
  )

  if (!showOrchestration) {
    return <div />
  }

  return (
    <SearchableSetting
      title={translate('auto.components.settings.MteFlowPane.title', 'MTE flow')}
      description={translate(
        'auto.components.settings.MteFlowPane.description',
        'Settings for MTE orchestration runs: planner, workers and validation.'
      )}
      keywords={searchEntries[0].keywords}
      forceVisible
      className="space-y-5 py-2"
    >
      <AgentSkillSetupPanel
        title={translate('auto.components.settings.MteFlowPane.skillTitle', 'MTE skill')}
        description={translate(
          'auto.components.settings.MteFlowPane.skillDescription',
          'Enables agents to start and drive MTE runs through Orca.'
        )}
        skillNames={[MTE_SKILL_NAME]}
        installed={orchestrationSkillDetected}
        loading={orchestrationSkillLoading}
        error={activeSkillRuntime.installDisabledReason ?? orchestrationSkillError}
        installDisabled={Boolean(activeSkillRuntime.installDisabledReason)}
        icon={<Workflow className="size-5" />}
        onBeforeInstall={() => {
          useAppStore.getState().recordFeatureInteraction('agent-orchestration-setup')
        }}
        // COMPAT(wsl-bridge): removed when WSL runs as an orcad host.
        actionHint={
          activeSkillRuntime.agentRuntime?.runtime === 'wsl' && !orchestrationSkillDetected ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setSkillPromptOpen(true)}
            >
              {translate('auto.components.settings.MteFlowPane.7bc082f4de', 'Copy install command')}
            </button>
          ) : undefined
        }
        footer={renderCoverage}
        onRecheck={refreshOrchestrationSkill}
        freshnessSkillName={activeSkillRuntime.canUseSkillFreshness ? MTE_SKILL_NAME : undefined}
      />

      {showLocalRuntimeSettings ? (
        <NumberField
          label={getNestedWorkerDepthTitle()}
          description={getNestedWorkerDepthDescription()}
          value={resolveNestedWorkerMaxDepth(settings)}
          min={1}
          integer
          onChange={(nestedWorkerMaxDepth) => {
            void updateSettings({ nestedWorkerMaxDepth })
          }}
        />
      ) : null}
      {showLocalRuntimeSettings ? (
        <OrchestrationWorkerAutoReleaseSetting
          settings={settings}
          updateSettings={updateSettings}
        />
      ) : null}

      {/* COMPAT(wsl-bridge): removed when WSL runs as an orcad host. */}
      {activeSkillRuntime.agentRuntime?.runtime === 'wsl' ? (
        <OrchestrationSkillPromptDialog
          command={buildSkillCommandForRuntime(
            MTE_SKILL_INSTALL_COMMAND,
            activeSkillRuntime.agentRuntime
          )}
          open={skillPromptOpen}
          onOpenChange={setSkillPromptOpen}
        />
      ) : null}
      <SkillUsageExamplesSection
        heading={translate('auto.components.settings.MteFlowPane.ae79504732', 'How to use it')}
        description={translate(
          'auto.components.settings.MteFlowPane.examplesDescription',
          'Ask an agent to use the MTE skill to plan, dispatch workers and validate a goal.'
        )}
        examples={getMteUsageExamples()}
        resolveIcon={resolveOrchestrationExampleIcon}
        slashCommand={`/${MTE_SKILL_NAME}`}
      />
    </SearchableSetting>
  )
}
