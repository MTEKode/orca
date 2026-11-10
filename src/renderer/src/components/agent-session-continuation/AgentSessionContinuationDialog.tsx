import { useAgentPickerDraftScope } from '../agent/AgentLaunchSetupButton'
import { agentsOfferedForLaunch } from '@/lib/agent-session/launch/inventory/host-chat-program'
import { worktreeLaunchWorkspace } from '@/lib/agent-session/launch/routing/agent-launch-route-input'
import { useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquarePlus } from 'lucide-react'
import { AgentLaunchPicker } from '@/components/agent/AgentLaunchPicker'
import {
  agentPickerFreshLaunchInputs,
  type AgentPickerDraft,
  type AgentPickerEntry
} from '../../../../shared/agent-launch/picker/agent-launch-picker'
import { useAgentMenuObservation } from '@/components/tab-bar/use-new-tab-agent-menu-rows'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import type { AgentLaunchSurface } from '@/lib/agent-session/launch/routing/agent-session-launch-plan'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
<<<<<<< HEAD
import { translate } from '@/i18n/i18n'
import { getAgentCatalog, getAgentLabel } from '@/lib/agent-catalog'
=======
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import { getAgentCatalog, getAgentLabel } from '@/lib/agent-catalog/agent-catalog'
>>>>>>> upstream/main
import {
  buildAgentSessionContinuationPrompt,
  type AgentSessionContinuationContextMode,
  type AgentSessionContinuationRequest
<<<<<<< HEAD
} from '@/lib/agent-session-continuation'
import { launchAgentSessionContinuation } from '@/lib/launch-agent-session-continuation'
import { startContinuationOrchestrationRun } from '@/lib/launch-continuation-orchestration'
import { MteOrchestrationPicker } from '@/components/mte-orchestration-picker/MteOrchestrationPicker'
import { NO_LINKED_ITEMS } from '@/components/mte-orchestration-picker/use-mte-orchestration-picker'
=======
} from '@/lib/agent-session/context/agent-session-continuation'
import { launchAgentSessionContinuation } from '@/lib/agent-session/launch/continuation/launch-agent-session-continuation'
>>>>>>> upstream/main
import { useAppStore } from '@/store'
import { isTuiAgentEnabled } from '../../../../shared/agent-launch/catalog/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import {
  chooseInitialContinuationAgent,
  isContinuationAgentAllowed
} from './agent-session-continuation-selection'
import { ContinuationChatPickFields } from './ContinuationChatPickFields'
import { ContinuationAgentStatus } from './ContinuationAgentStatus'
import { ContinuationContextSection } from './ContinuationContextSection'
import { useContinuationModelPick } from './use-continuation-model-pick'
import { useContinuationOrchestration } from './use-continuation-orchestration'

type AgentSessionContinuationDialogProps = {
  open: boolean
  request: AgentSessionContinuationRequest | null
  sourceWorkingDirectory?: string
  onOpenChange: (open: boolean) => void
  /** Fires after the new session launched, so a host can step aside for the new tab. */
  onStarted?: () => void
}

const EMPTY_DISABLED_AGENTS: TuiAgent[] = []

export function AgentSessionContinuationDialog({
  open,
  request,
  sourceWorkingDirectory,
  onOpenChange,
  onStarted
}: AgentSessionContinuationDialogProps): React.JSX.Element {
  const t = useTranslate()
  const workspace = request ? worktreeLaunchWorkspace(request.worktreeId) : null
  const abortRef = useRef<AbortController | null>(null)
  const settings = useAppStore((state) => state.settings)
  const [pick, setPick] = useState<{
    request: AgentSessionContinuationRequest | null
    agent: TuiAgent
    surface?: AgentLaunchSurface
    model?: string
    effort?: string
    draft?: AgentPickerDraft
    entry?: AgentPickerEntry
  } | null>(null)
  const detectionTarget = useAgentDetectionTargetForWorktree(request?.worktreeId ?? null)
  const [contextPick, setContextPick] = useState<{
    request: AgentSessionContinuationRequest | null
    mode: AgentSessionContinuationContextMode
  } | null>(null)
  // One start's own token: a closed or reopened dialog no longer waits on a start it left behind.
  const [startingFor, setStartingFor] = useState<{
    request: AgentSessionContinuationRequest
  } | null>(null)
  if (!open) {
    if (pick) {
      setPick(null)
    }
    if (contextPick) {
      setContextPick(null)
    }
    if (startingFor) {
      setStartingFor(null)
    }
  }
  const contextMode = contextPick?.request === request ? contextPick.mode : 'focused'
  const starting = open && startingFor?.request === request
  const [showStarting, setShowStarting] = useState(false)
  const disabledAgents = settings?.disabledTuiAgents ?? EMPTY_DISABLED_AGENTS

  const observation = useAgentMenuObservation(
    workspace ? { workspace, launchCwd: request?.initialCwd } : null,
    open && Boolean(request),
    detectionTarget,
    { wakeOnOpen: true }
  )
  const { detectedIds, detectionFailed } = observation.detection
  const detecting =
    detectedIds === null && !detectionFailed && !observation.detection.needsServerUpdate
  // Agents whose chat opens without their CLI are listed too; their rows decide what is pickable.
  const offered = workspace
    ? agentsOfferedForLaunch(useAppStore.getState(), workspace, detectedIds)
    : []
  const agents = getAgentCatalog().filter(
    (agent) =>
      isTuiAgentEnabled(agent.id, disabledAgents) &&
      isContinuationAgentAllowed(agent.id, request?.source.sourceAgent, request?.avoidSourceAgent)
  )
  const destinationModel =
    observation.model.state === 'settled'
      ? {
          ...observation.model,
          rows: observation.model.rows.filter((row) =>
            agents.some((agent) => agent.id === row.agent)
          )
        }
      : observation.model
  const rows = destinationModel.state === 'settled' ? destinationModel.rows : []
  const pickable = agents
    .map((agent) => agent.id)
    .filter(
      (agent) =>
        offered.includes(agent) &&
        rows.some((row) => row.agent === agent && row.kind !== 'chat-unavailable')
    )
  // Why: the explanation must read the same host rows the picker shows, before the family filter.
  const openableRows =
    observation.model.state === 'settled'
      ? observation.model.rows.filter((row) => row.kind !== 'chat-unavailable')
      : []
  const onlySourceFamilyOffered =
    openableRows.length > 0 &&
    openableRows.every(
      (row) =>
        !isContinuationAgentAllowed(
          row.agent,
          request?.source.sourceAgent,
          request?.avoidSourceAgent
        )
    )
  const preparing = request === null
  const controlsDisabled = preparing || detecting || starting

  useEffect(() => {
    const abort = open && request ? new AbortController() : null
    abortRef.current = abort
    return () => abort?.abort()
  }, [open, request])

  const draftScope = useAgentPickerDraftScope(request)
  const currentPick = pick?.request === request && pickable.includes(pick.agent) ? pick : null
  const selectedAgent =
    currentPick?.agent ??
    chooseInitialContinuationAgent({
      availableAgents: pickable,
      automaticAgents: pickable.filter((agent) => detectedIds?.includes(agent)),
      sourceAgent: request?.avoidSourceAgent ? null : (request?.source.sourceAgent ?? null),
      defaultAgent: settings?.defaultTuiAgent
    })
  const selection = observation.selectionFor(selectedAgent, currentPick?.surface)
  // Only a chat carries model and effort; a terminal runs whatever the CLI's saved profile says.
  const chatRoute = selection.choice?.route === 'structured-native-chat'
  const chatPick = useContinuationModelPick({
    worktreeId: request?.worktreeId,
    model: destinationModel,
    open: open && Boolean(request),
    agent: selectedAgent,
    picked: currentPick,
    chat: chatRoute
  })
  const orchestration = useContinuationOrchestration({ request, open, model: observation.model })
  const orchestrationOn = orchestration.available && orchestration.draft.enabled

  useEffect(() => {
    if (!starting) {
      setShowStarting(false)
      return
    }
    // Why: local launches are often instant; defer the spinner so fast paths do not flicker.
    const timer = window.setTimeout(() => setShowStarting(true), 200)
    return () => window.clearTimeout(timer)
  }, [starting])

  const handleStart = async (): Promise<void> => {
    if (!request || starting) {
      return
    }
    if (orchestrationOn) {
      const { repoId, workspaceRoot } = orchestration
      if (!repoId || !workspaceRoot || !orchestration.draft.canStart) {
        return
      }
      setStarting(true)
      const launched = await startContinuationOrchestrationRun({
        request,
        repoId,
        workspaceRoot,
        contextMode,
        draft: orchestration.draft
      })
      setStarting(false)
      if (launched) {
        onOpenChange(false)
        onStarted?.()
      }
      return
    }
    if (detecting || !selectedAgent || !selection.ready || !selection.choice) {
      return
    }
    const prompt = buildAgentSessionContinuationPrompt(request.source, contextMode)
    if (!prompt) {
      return
    }
<<<<<<< HEAD
    const launchOptions = chatPick.launchOptions
    setStarting(true)
=======
    const start = { request }
    // Aborts when the dialog closes or moves to another request; a sent launch still settles.
    const signal = abortRef.current?.signal
    setStartingFor(start)
>>>>>>> upstream/main
    const launched = await launchAgentSessionContinuation({
      agent: selectedAgent,
      prompt,
      worktreeId: request.worktreeId,
      groupId: request.groupId,
      initialCwd: request.initialCwd,
      launchChoice: selection.choice,
      ...(currentPick?.draft
        ? agentPickerFreshLaunchInputs(
            currentPick.draft,
            {
              surface: selection.choice.route === 'terminal-tui' ? 'terminal' : 'chat',
              executionHostId: selection.choice.executionHostId
            },
            currentPick.entry
          )
        : {}),
      ...(launchOptions ? { launchOptions } : {}),
      launchSource: request.launchSource,
      signal
    })
    setStartingFor((current) => (current === start ? null : current))
    // A late finish is reported by the launch's own owners, never by a dialog it no longer holds.
    if (launched && !signal?.aborted) {
      onOpenChange(false)
      onStarted?.()
    }
  }

  const sourceName = request?.source.sourceTitle?.trim()
  const sourceAgentLabel = request?.source.sourceAgent
    ? getAgentLabel(request.source.sourceAgent)
    : null
  const startDisabled = orchestrationOn
    ? controlsDisabled || !orchestration.draft.canStart
    : controlsDisabled || agents.length === 0 || !selectedAgent || !selection.ready
  const workingDirectory = sourceWorkingDirectory ?? request?.initialCwd

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <MessageSquarePlus className="size-4" />
            {t('components.agentSessionContinuation.dialogTitle', 'Hand Off to Another Agent')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t(
              'components.agentSessionContinuation.dialogDescription',
              'Start a fresh Agent session from this stopping point. The original session stays unchanged.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="truncate text-xs font-medium">
              {sourceName ||
                t('components.agentSessionContinuation.untitledSession', 'Current session')}
            </div>
            <div className="mt-0.5 min-h-4 text-[11px] text-muted-foreground">
              {sourceAgentLabel
                ? t(
                    'components.agentSessionContinuation.originalAgent',
                    'Original Agent: {{agent}}',
                    { agent: sourceAgentLabel }
                  )
                : null}
            </div>
          </div>

<<<<<<< HEAD
          {orchestration.available ? (
            <MteOrchestrationPicker
              draft={orchestration.draft}
              linkedItems={NO_LINKED_ITEMS}
              onSelectAgent={orchestration.onSelectAgent}
            />
          ) : null}

          {!orchestrationOn ? (
            <div className="min-w-0 space-y-1.5">
              <label className="text-xs font-medium">
                {translate('components.agentSessionContinuation.agent', 'Agent')}
              </label>
              <AgentLaunchPicker
                draftScope={draftScope}
                disabled={controlsDisabled}
                model={destinationModel}
                worktreeId={request?.worktreeId}
                agent={selectedAgent}
                cli={selection.cli}
                value={currentPick?.draft}
                onPick={(agent, draft, entry) =>
                  setPick({
                    request,
                    agent,
                    surface: draft?.surface,
                    model: draft?.choices.model,
                    effort: draft?.choices.options?.effort,
                    draft,
                    entry
                  })
                }
              />
              <ContinuationAgentStatus
                preparing={preparing}
                detecting={detecting}
                detectionFailed={detectionFailed}
                noAgents={destinationModel.state === 'settled' && rows.length === 0}
                onlySourceFamilyOffered={onlySourceFamilyOffered}
                sourceAgentLabel={sourceAgentLabel}
              />
            </div>
          ) : null}

          {chatRoute && !orchestrationOn ? (
            <ContinuationChatPickFields
              entry={chatPick.entry}
              value={chatPick.pick}
              surface={currentPick?.surface}
              disabled={controlsDisabled}
              onChange={(next) => setPick({ request, ...next })}
            />
          ) : null}

          <ContinuationContextSection
            request={request}
            preparing={preparing}
            contextMode={contextMode}
            disabled={controlsDisabled}
            onModeChange={(mode) => setContextPick({ request, mode })}
          />
=======
          <div className="min-w-0 space-y-1.5">
            <label className="text-xs font-medium">
              {t('components.agentSessionContinuation.agent', 'Agent')}
            </label>
            <AgentLaunchPicker
              draftScope={draftScope}
              disabled={controlsDisabled}
              model={destinationModel}
              worktreeId={request?.worktreeId}
              agent={selectedAgent}
              cli={selection.cli}
              value={currentPick?.draft}
              onPick={(agent, draft, entry) =>
                setPick({ request, agent, surface: draft?.surface, draft, entry })
              }
            />
            <div className="min-h-4">
              {preparing ? (
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    'components.agentSessionContinuation.preparingContext',
                    'Preparing saved chat context…'
                  )}
                </p>
              ) : detecting ? (
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    'components.agentSessionContinuation.detectingAgents',
                    'Detecting Agents on this workspace host…'
                  )}
                </p>
              ) : detectionFailed ? (
                <p className="text-[11px] text-destructive">
                  {t(
                    'components.agentSessionContinuation.detectionFailed',
                    'Could not detect Agents on this workspace host.'
                  )}
                </p>
              ) : destinationModel.state === 'settled' && rows.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {onlySourceFamilyOffered && sourceAgentLabel
                    ? t(
                        'components.agentSessionContinuation.onlySourceFamilyDetected',
                        'Only Agents sharing the usage limit with {{agent}} are available on this workspace host. Enable or install a different Agent.',
                        { agent: sourceAgentLabel }
                      )
                    : t(
                        'components.agentSessionContinuation.noAgents',
                        'No enabled Agents were detected on this workspace host.'
                      )}
                </p>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 space-y-1.5">
            <label className="text-xs font-medium">
              {t('components.agentSessionContinuation.context', 'Context')}
            </label>
            <Select
              disabled={controlsDisabled}
              value={contextMode}
              onValueChange={(value) => {
                if (value === 'focused' || value === 'full') {
                  setContextPick({ request, mode: value })
                }
              }}
            >
              <SelectTrigger className="min-w-0 w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="focused">
                  {t(
                    'components.agentSessionContinuation.modeFocused',
                    'Focused handoff (Recommended)'
                  )}
                </SelectItem>
                <SelectItem value="full" disabled={!hasFullContext}>
                  {t('components.agentSessionContinuation.modeFull', 'Full session transcript')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="min-h-12 text-[11px] leading-4 text-muted-foreground">
              {preparing
                ? null
                : !hasFullContext
                  ? request?.source.sourceKind === 'chat'
                    ? t(
                        'components.agentSessionContinuation.modeLoadedDescription',
                        'Uses recent messages currently loaded in this chat and the current workspace.'
                      )
                    : t(
                        'components.agentSessionContinuation.modeCapturedDescription',
                        'Uses captured text and the current workspace.'
                      )
                  : contextMode === 'focused'
                    ? t(
                        'components.agentSessionContinuation.modeFocusedDescription',
                        'Uses the latest status and current workspace, reading older transcript details only when needed.'
                      )
                    : t(
                        'components.agentSessionContinuation.modeFullDescription',
                        'Asks the new Agent to read the complete saved session before continuing. This can take longer and use significant context, plan usage, or API credits.'
                      )}
            </p>
          </div>
>>>>>>> upstream/main

          <div className="min-h-4 text-[11px] text-muted-foreground">
            {workingDirectory ? (
              <>
                {t('components.agentSessionContinuation.startsIn', 'Starts in:')}{' '}
                <span className="break-all font-mono text-foreground/80">{workingDirectory}</span>
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('components.native-chat.question.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            autoFocus
            disabled={startDisabled}
            onClick={() => void handleStart()}
          >
            {showStarting ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {starting
              ? t('components.agentSessionContinuation.starting', 'Starting…')
              : t('components.agentSessionContinuation.startSession', 'Start New Session')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
