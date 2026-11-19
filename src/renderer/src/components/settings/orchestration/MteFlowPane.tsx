import type { BundledSkillPlan } from '../../../../../shared/skills/bundled/bundled-skill-plan'
import { useCallback, useState } from 'react'
import { OrchestrationSkillPromptDialog } from './OrchestrationSkillPromptDialog'
import { buildSkillCommandForRuntime } from '../../../lib/skills/runtime/skill-runtime-command'
import { MTE_SKILL_INSTALL_COMMAND } from '@/lib/skills/installation/agent-feature-install-commands'
import { ArrowRightLeft, GitBranch, ListChecks, Workflow, type LucideIcon } from 'lucide-react'
import { MTE_SKILL_NAME } from '@/lib/skills/installation/agent-feature-skill-names'
import type { SkillUsageExample } from '@/lib/skills/examples/skill-usage-example'
import { getMteUsageExamples } from '@/lib/mte-usage-examples'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '@/hooks/skills/discovery/useInstalledAgentSkills'
import { useActiveProjectSkillRuntime } from '@/hooks/skills/runtime/useActiveProjectSkillRuntime'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { matchesSettingsSearch } from '../search/settings-search'
import { useAppStore } from '../../../store/index'
import { getMteFlowPaneSearchEntries } from './mte-flow-search'
import { AgentSkillSetupPanel } from '../../skills/setup/AgentSkillSetupPanel'
import { OrchestrationSkillAgentCoverage } from './OrchestrationSkillAgentCoverage'
import { SkillUsageExamplesSection } from '../../skills/examples/SkillUsageExamplesSection'
import { useTranslate } from '@/i18n/use-translate'
import type { GlobalSettings } from '../../../../../shared/settings/global-settings-types'
import { resolveNestedWorkerMaxDepth } from '../../../../../shared/orchestration/workers/nested-worker-depth'
import { isPairedWebClientWindow } from '@/app-shell/chrome/desktop-window-chrome'
import { NumberField } from '../form-controls/SettingsFormControls'
import {
  getNestedWorkerDepthDescription,
  getNestedWorkerDepthTitle
} from './nested-worker-depth-copy'
import { OrchestrationWorkerAutoReleaseSetting } from './OrchestrationWorkerAutoReleaseSetting'
import { OrchestrationCoordinatorApprovalsSetting } from './OrchestrationCoordinatorApprovalsSetting'
import { SettingsGroup } from '../section-layout/SettingsGroup'
import { Card, CardContent } from '@/components/ui/card'

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

function FlowTemplateCard({
  title,
  description,
  example
}: {
  title: string
  description: string
  example: string
}): React.JSX.Element {
  return (
    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
      <CardContent className="p-4">
        <div className="space-y-2">
          <h4 className="text-sm font-medium">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
          <div className="rounded bg-muted/50 p-2">
            <code className="text-xs">{example}</code>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

type MteFlowPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function MteFlowPane({ settings, updateSettings }: MteFlowPaneProps): React.JSX.Element {
  const t = useTranslate()
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
      title={t('auto.components.settings.MteFlowPane.title', 'Flow')}
      description={t(
        'auto.components.settings.MteFlowPane.description',
        'Settings for Flow orchestration: planner, workers and validation.'
      )}
      keywords={searchEntries[0].keywords}
      forceVisible
      className="space-y-8"
    >
      <SettingsGroup>
        <div className="py-4">
          <AgentSkillSetupPanel
            variant="inline"
            title={t('auto.components.settings.MteFlowPane.skillTitle', 'Flow orchestration')}
            description={t(
              'auto.components.settings.MteFlowPane.skillDescription',
              'Enables agents to orchestrate work: plan tasks, dispatch workers, and validate results. Click install to enable Flow in your agents.'
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
                  {t('auto.components.settings.MteFlowPane.7bc082f4de', 'Copy install command')}
                </button>
              ) : undefined
            }
            footer={renderCoverage}
            onRecheck={refreshOrchestrationSkill}
            freshnessSkillName={
              activeSkillRuntime.canUseSkillFreshness ? MTE_SKILL_NAME : undefined
            }
          />
        </div>
        {showLocalRuntimeSettings ? (
          <NumberField
            label={getNestedWorkerDepthTitle(t)}
            description={getNestedWorkerDepthDescription(t)}
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
        {showLocalRuntimeSettings ? (
          <OrchestrationCoordinatorApprovalsSetting
            settings={settings}
            updateSettings={updateSettings}
          />
        ) : null}
      </SettingsGroup>

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
        heading={t('auto.components.settings.MteFlowPane.ae79504732', 'How to use it')}
        description={t(
          'auto.components.settings.MteFlowPane.examplesDescription',
          'Ask an agent to use the Flow skill to plan, dispatch workers and validate a goal.'
        )}
        examples={getMteUsageExamples()}
        resolveIcon={resolveOrchestrationExampleIcon}
        slashCommand={`/${MTE_SKILL_NAME}`}
      />

      <div className="space-y-4">
        <h3 className="text-sm font-medium">
          {t('auto.components.settings.MteFlowPane.flowTemplates', 'Flow templates')}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FlowTemplateCard
            title={t('auto.components.settings.MteFlowPane.template.bugFix', 'Bug fix')}
            description={t(
              'auto.components.settings.MteFlowPane.template.bugFixDescription',
              'Quick fix with 1 worker and validation'
            )}
            example={t(
              'auto.components.settings.MteFlowPane.template.bugFixExample',
              'Use Flow to fix the login bug in auth-service.ts'
            )}
          />
          <FlowTemplateCard
            title={t('auto.components.settings.MteFlowPane.template.feature', 'Feature')}
            description={t(
              'auto.components.settings.MteFlowPane.template.featureDescription',
              'Multi-worker feature implementation'
            )}
            example={t(
              'auto.components.settings.MteFlowPane.template.featureExample',
              'Use Flow to implement user authentication with OAuth'
            )}
          />
          <FlowTemplateCard
            title={t('auto.components.settings.MteFlowPane.template.refactor', 'Refactor')}
            description={t(
              'auto.components.settings.MteFlowPane.template.refactorDescription',
              'Sequential workers for safe refactoring'
            )}
            example={t(
              'auto.components.settings.MteFlowPane.template.refactorExample',
              'Use Flow to refactor the database layer to use the new ORM'
            )}
          />
          <FlowTemplateCard
            title={t('auto.components.settings.MteFlowPane.template.exploration', 'Exploration')}
            description={t(
              'auto.components.settings.MteFlowPane.template.explorationDescription',
              'Research and planning without code changes'
            )}
            example={t(
              'auto.components.settings.MteFlowPane.template.explorationExample',
              'Use Flow to explore the codebase and plan a migration strategy'
            )}
          />
        </div>
      </div>
    </SearchableSetting>
  )
}
