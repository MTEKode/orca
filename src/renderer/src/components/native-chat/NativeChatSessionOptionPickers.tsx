/* eslint-disable max-lines -- Why: SessionOptionPopover and HarnessModelSubmenu keep popover trigger, model combobox, option rows, and direct handoff harness picker cohesive without separate lifecycle state. */

import React, { memo, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { sortNativeChatSessionOptions } from '../../../../shared/native-chat/input/native-chat-session-option-snapshot'
import {
  sessionOptionDispatchUnconfirmed,
  type SessionOptionDescriptor,
  type SessionOptionsSurface,
  type SessionOptionValue
} from '../../../../shared/native-chat/input/native-chat-session-options'
import {
  nativeChatModelPillLabel,
  nativeChatOptionValuesLabel,
  nativeChatOptionsPillTitle,
  nativeChatSessionOptionActionLabel,
  nativeChatSessionOptionDisabledReason
} from '../../../../shared/native-chat/input/native-chat-session-option-labels'
import type { MteWorkerPin } from '../../../../shared/mte/worker-pin'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { AgentPickerEntry } from '../../../../shared/agent-launch/picker/agent-launch-picker'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useNewTabAgentMenuRows } from '../tab-bar/use-new-tab-agent-menu-rows'
import {
  useAgentLaunchPickerInventorySource,
  useAgentPickerInventoryEntries
} from '@/components/agent/use-agent-launch-picker-inventory'
import { newChatEntries, newChatModels, resolveNewChatPick } from '../tab-bar/new-chat-pick'

const LazyNewChatHarnessLabel = React.lazy(async () => {
  const { NewChatHarnessLabel: Component } = await import('../tab-bar/NewChatOptionIcons')
  return { default: Component }
})

function NewChatHarnessLabel(props: {
  agent: TuiAgent
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <React.Suspense fallback={<span className="truncate">{props.children}</span>}>
      <LazyNewChatHarnessLabel agent={props.agent}>{props.children}</LazyNewChatHarnessLabel>
    </React.Suspense>
  )
}
import {
  composerAgentPillLabel,
  composerSidePillLabel
} from './native-chat-composer-agent-label-text'
import { sayNativeChatSessionOptionTranslated as say } from './native-chat-session-option-labels-text'
import type { NativeChatOptionPickerRequest } from './native-chat-composer-types'
import { runSessionOptionSurfaceCall } from './native-chat-session-option-surface-call'
import { NativeChatModelCombobox } from './NativeChatModelCombobox'
import { useNativeChatPickerFocusReturn } from './native-chat-picker-focus-return'
import { NativeChatSessionOptionRows } from './NativeChatSessionOptionRows'
import { NativeChatSessionOptionWriteGroup } from './NativeChatSessionOptionWriteGroup'

export type NativeChatSessionOptionPickersProps = {
  surface: SessionOptionsSurface | null
  snapshot: SessionOptionDescriptor[]
  isWorking: boolean
  pickerRequest?: NativeChatOptionPickerRequest | null
  /** Where focus lands after a visit that changed something; see `useNativeChatPickerFocusReturn`. */
  focusComposer?: () => void
  /** The chat's agent: with it, the pill reads "Agent: Claude · Model · Effort" instead of model · effort. */
  agent?: string
  /** Set on an MTE planner chat: this pill then reads "Orchestrator: …" (the worker has its own selector). */
  mteWorker?: MteWorkerPin
  worktreeId?: string
  onSwitchHarness?: (pick: {
    agent: TuiAgent
    model?: string
    effort?: string
  }) => void | Promise<void>
}

/** A descriptor write in flight; its value shows until it settles. */
type PendingPick = { id: string; value?: SessionOptionValue }

// Show pending picks in place while open; refusal restores the host snapshot.
function withPendingValue(
  descriptor: SessionOptionDescriptor,
  pending: PendingPick | null
): SessionOptionDescriptor {
  if (pending?.id !== descriptor.id) {
    return descriptor
  }
  const { kind } = descriptor
  if (kind.type === 'select' && typeof pending.value === 'string') {
    return {
      ...descriptor,
      valueSource: 'dispatched',
      kind: { ...kind, currentValue: pending.value }
    }
  }
  if (kind.type === 'boolean' && typeof pending.value === 'boolean') {
    return {
      ...descriptor,
      valueSource: 'dispatched',
      kind: { ...kind, currentValue: pending.value }
    }
  }
  return descriptor
}

// Keep visible value text inside the accessible name for voice control (WCAG 2.5.3).
function pillAccessibleName(title: string, value: string): string {
  return value === title
    ? title
    : translate('components.native-chat.composer.pillAccessibleName', '{{value0}} {{value1}}', {
        value0: title,
        value1: value
      })
}

function PickerTrigger(props: {
  modelLabel: string
  /** The options' values, shown after the model; empty when there are none to show. */
  optionsLabel: string
  /** Replaces the model and options text with one agent-labelled line. */
  agentLabel: string | null
  wide: boolean
  accessibleName: string
  disabled: boolean
  disabledReason: string | null
  dispatched: boolean
  triggerRef: React.Ref<HTMLButtonElement>
  onClick?: () => void
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>
}): React.JSX.Element {
  const [tooltipOpen, setTooltipOpen] = useState(false)
  // Keep the tooltip mounted but closed unless informative; changing wrapper identity would detach the open picker.
  const informative = props.disabledReason !== null || props.dispatched
  return (
    <Tooltip open={informative && tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild disabled={props.disabled}>
          <Button
            ref={props.triggerRef}
            type="button"
            variant="ghost"
            size="xs"
            aria-label={props.accessibleName}
            disabled={props.disabled}
            className={props.wide ? 'max-w-md' : 'max-w-64'}
            onClick={props.onClick}
            onKeyDown={props.onKeyDown}
          >
            {props.agentLabel ? (
              <span className="truncate text-chat-foreground">{props.agentLabel}</span>
            ) : (
              <>
                <span className="truncate text-chat-foreground">{props.modelLabel}</span>
                {props.optionsLabel ? <span className="shrink-0">{props.optionsLabel}</span> : null}
              </>
            )}
            <ChevronDown className="size-3" />
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <div className="space-y-0.5">
          {props.disabledReason ? <div>{props.disabledReason}</div> : null}
          {props.dispatched ? (
            <div>
              {translate(
                'components.native-chat.composer.sentNotConfirmed',
                'Sent to the agent — not confirmed'
              )}
            </div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function HarnessModelSubmenu({
  worktreeId,
  open,
  currentAgent,
  model,
  onSetModel,
  onSwitchHarness,
  onClosePopover
}: {
  worktreeId: string
  open: boolean
  currentAgent?: string
  model: SessionOptionDescriptor
  onSetModel: (descriptor: SessionOptionDescriptor, value: SessionOptionValue) => void
  onSwitchHarness?: (pick: {
    agent: TuiAgent
    model?: string
    effort?: string
  }) => void | Promise<void>
  onClosePopover: () => void
}): React.JSX.Element {
  const [selectedAgent, setSelectedAgent] = useState<TuiAgent | undefined>(undefined)
  const target = useAgentDetectionTargetForWorktree(worktreeId)
  const menuModel = useNewTabAgentMenuRows(worktreeId, open, target)
  const source = useAgentLaunchPickerInventorySource(worktreeId, menuModel, open, selectedAgent)
  const rawEntries = useAgentPickerInventoryEntries(source)
  const entries = newChatEntries(rawEntries)

  const handlePick = (entry: AgentPickerEntry, pickedModelId?: string) => {
    const resolved = resolveNewChatPick(entries, {
      agent: entry.agent,
      ...(pickedModelId ? { model: pickedModelId } : {})
    })
    if (entry.agent === currentAgent) {
      if (pickedModelId) {
        onSetModel(model, pickedModelId)
      }
    } else {
      onClosePopover()
      void onSwitchHarness?.({
        agent: entry.agent,
        ...(pickedModelId ? { model: pickedModelId } : {}),
        ...(resolved?.effort ? { effort: resolved.effort } : {})
      })
    }
  }

  return (
    <div className="border-b p-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span>
              {translate('components.native-chat.composer.switchHarness', 'Switch harness…')}
            </span>
            <ChevronRight className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {entries.map((entry) => {
            const models = newChatModels(entry)
            const isPending = entry.catalogRead === 'pending'
            return (
              <DropdownMenuSub key={entry.agent}>
                <DropdownMenuSubTrigger
                  onPointerEnter={() => setSelectedAgent(entry.agent)}
                  onMouseEnter={() => setSelectedAgent(entry.agent)}
                  onFocus={() => setSelectedAgent(entry.agent)}
                >
                  <NewChatHarnessLabel agent={entry.agent}>{entry.label}</NewChatHarnessLabel>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {models.length > 0 ? (
                    models.map((m) => {
                      const onPick = () => handlePick(entry, m.id)
                      return (
                        <DropdownMenuItem key={m.id} onSelect={onPick} onClick={onPick}>
                          {m.label}
                        </DropdownMenuItem>
                      )
                    })
                  ) : (
                    <>
                      <DropdownMenuItem
                        onSelect={() => handlePick(entry, undefined)}
                        onClick={() => handlePick(entry, undefined)}
                      >
                        {entry.label}
                      </DropdownMenuItem>
                      {isPending ? (
                        <DropdownMenuItem disabled>
                          {translate(
                            'components.native-chat.composer.loadingModels',
                            'Loading models…'
                          )}
                        </DropdownMenuItem>
                      ) : null}
                    </>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SessionOptionPopover(props: {
  demandModelCatalog?: () => void
  model: SessionOptionDescriptor
  options: readonly SessionOptionDescriptor[]
  isWorking: boolean
  /** Only the descriptor being saved holds its write controls. */
  pendingIds: ReadonlySet<string>
  request: NativeChatOptionPickerRequest | null
  onSet: (descriptor: SessionOptionDescriptor, value: SessionOptionValue) => void
  onAction: (descriptor: SessionOptionDescriptor) => void
  focusComposer?: () => void
  agent?: string
  mteWorker?: MteWorkerPin
  worktreeId?: string
  onSwitchHarness?: (pick: {
    agent: TuiAgent
    model?: string
    effort?: string
  }) => void | Promise<void>
}): React.JSX.Element {
  const { model, options, pendingIds, demandModelCatalog } = props
  const canOpen = [model, ...options].some(
    (descriptor) =>
      descriptor.settable &&
      !pendingIds.has(descriptor.id) &&
      (!props.isWorking || descriptor.transport === 'agent-session')
  )
  // Why here: this unmounts with the pill, so a picker that went away comes back closed.
  const [open, setOpen] = useState(false)
  const [seenRequest, setSeenRequest] = useState<NativeChatOptionPickerRequest | null>(null)
  // The option a slash command asked for, focused in place of the search by that opening only.
  const [requestedOptionId, setRequestedOptionId] = useState<string | null>(null)
  if (props.request !== seenRequest) {
    setSeenRequest(props.request)
    if (props.request && canOpen) {
      setOpen(true)
      setRequestedOptionId(props.request.id === model.id ? null : props.request.id)
    }
  }
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      demandModelCatalog?.()
    }
    wasOpen.current = open
  }, [open, demandModelCatalog])
  const focusReturn = useNativeChatPickerFocusReturn(props.focusComposer)
  const modelTitle = translate('components.native-chat.composer.model', 'Model')
  const modelLabel = nativeChatModelPillLabel(model, say)
  const modelName = pillAccessibleName(modelTitle, modelLabel)
  const optionsTitle = nativeChatOptionsPillTitle(options, say)
  const optionsLabel = nativeChatOptionValuesLabel(options, say)
  // The live pick, so the label follows model and effort changes; an unreported model is left out.
  const agentSide = props.agent
    ? {
        agent: props.agent,
        ...(model.valueSource !== 'unknown' && modelLabel !== modelTitle
          ? { model: modelLabel }
          : {}),
        ...(optionsLabel ? { effort: optionsLabel } : {})
      }
    : null
  // On an MTE chat the worker has its own selector, so this pill names the orchestrator only.
  const agentLabel = agentSide
    ? props.mteWorker
      ? composerSidePillLabel('orchestrator', agentSide)
      : composerAgentPillLabel({ orchestrator: agentSide })
    : null
  const modelReason = nativeChatSessionOptionDisabledReason(model.disabledReason, say)
  const optionsReason =
    options.length > 0 && options.every((descriptor) => !descriptor.settable)
      ? nativeChatSessionOptionDisabledReason(options[0]?.disabledReason, say)
      : null

  // Different descriptors can save together; hold only a repeat of the same pick.
  const set = (descriptor: SessionOptionDescriptor, value: SessionOptionValue): void => {
    if (pendingIds.has(descriptor.id)) {
      return
    }
    focusReturn.notePick()
    // Why: effort is the last thing set before typing, so its level closes the picker.
    if (descriptor.id === 'effort') {
      setOpen(false)
    }
    if (
      descriptor.valueSource === 'unknown' ||
      descriptor.valueSource === 'default' ||
      descriptor.kind.currentValue !== value
    ) {
      props.onSet(descriptor, value)
    }
  }
  const act = (descriptor: SessionOptionDescriptor): void => {
    if (pendingIds.has(descriptor.id)) {
      return
    }
    // Why: agent-picker opens the TUI, and that picker owns focus.
    if (descriptor.action?.type !== 'agent-picker') {
      focusReturn.notePick()
    }
    setOpen(false)
    props.onAction(descriptor)
  }

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next && canOpen)}>
      <PickerTrigger
        modelLabel={modelLabel}
        optionsLabel={optionsLabel}
        agentLabel={agentLabel}
        wide={props.mteWorker !== undefined}
        accessibleName={
          agentLabel
            ? pillAccessibleName(modelTitle, agentLabel)
            : optionsLabel
              ? `${modelName}, ${pillAccessibleName(optionsTitle, optionsLabel)}`
              : modelName
        }
        disabled={!canOpen}
        disabledReason={modelReason ?? optionsReason}
        dispatched={
          sessionOptionDispatchUnconfirmed(model) || options.some(sessionOptionDispatchUnconfirmed)
        }
        triggerRef={focusReturn.triggerRef}
        onClick={() => setOpen((prev) => !prev && canOpen)}
        // Why: a popover trigger opens on Enter and Space only; a menu also takes ArrowDown.
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && canOpen) {
            event.preventDefault()
            setOpen(true)
          }
        }}
      />
      <PopoverContent
        // Why end: the pill's label changes under an open picker; only its right edge stays put.
        align="end"
        side="top"
        collisionPadding={8}
        className="flex w-96 max-w-(--radix-popover-content-available-width) flex-col"
        onOpenAutoFocus={(event) => {
          const content = event.currentTarget
          const optionId = requestedOptionId
          setRequestedOptionId(null)
          if (!optionId || !(content instanceof HTMLElement)) {
            return
          }
          const row = content.querySelector(`[data-option-id="${CSS.escape(optionId)}"]`)
          const control =
            row?.querySelector<HTMLElement>('[aria-checked="true"]:not(:disabled)') ??
            row?.querySelector<HTMLElement>('button:not(:disabled)')
          if (control) {
            event.preventDefault()
            control.focus()
          }
        }}
        onInteractOutside={focusReturn.onInteractOutside}
        onCloseAutoFocus={focusReturn.onCloseAutoFocus}
        // Close through a level tooltip’s first Escape; let Radix handle search Escape after IME.
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement)) {
            setOpen(false)
          }
        }}
      >
        {props.worktreeId && props.onSwitchHarness ? (
          <HarnessModelSubmenu
            worktreeId={props.worktreeId}
            open={open}
            currentAgent={props.agent}
            model={model}
            onSetModel={set}
            onSwitchHarness={props.onSwitchHarness}
            onClosePopover={() => setOpen(false)}
          />
        ) : null}
        {model.kind.type === 'select' && !model.action ? (
          <NativeChatModelCombobox
            choices={model.kind.choices}
            currentValue={model.kind.currentValue}
            readOnly={!model.settable}
            readOnlyReason={modelReason}
            busy={pendingIds.has(model.id)}
            onSelect={(value) => set(model, value)}
          />
        ) : (
          <NativeChatSessionOptionWriteGroup
            busy={pendingIds.has(model.id)}
            className="flex flex-col p-1"
          >
            {modelReason && !model.settable ? (
              <div className="px-2 py-1 text-xs text-muted-foreground">{modelReason}</div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={!model.settable}
              className="w-full justify-start"
              onClick={() => act(model)}
            >
              {nativeChatSessionOptionActionLabel(model, say)}
            </Button>
          </NativeChatSessionOptionWriteGroup>
        )}
        <NativeChatSessionOptionRows
          options={options}
          shownReason={model.settable ? null : modelReason}
          pendingIds={pendingIds}
          onSet={set}
          onAction={act}
        />
      </PopoverContent>
    </Popover>
  )
}

function NativeChatSessionOptionPickersInner({
  surface,
  snapshot,
  isWorking,
  pickerRequest,
  focusComposer,
  agent,
  mteWorker,
  worktreeId,
  onSwitchHarness
}: NativeChatSessionOptionPickersProps): React.JSX.Element | null {
  useUiLanguageRevision()
  const [pending, setPending] = useState<ReadonlyMap<string, PendingPick>>(() => new Map())
  // Consume requests even without a usable picker so composer remounts cannot reopen them.
  useEffect(() => pickerRequest?.consume(), [pickerRequest])
  const reportedModel = snapshot.find((descriptor) => descriptor.category === 'model')
  if (!surface || !reportedModel) {
    return null
  }
  const model = withPendingValue(reportedModel, pending.get(reportedModel.id) ?? null)
  const options = sortNativeChatSessionOptions(snapshot).map((descriptor) =>
    withPendingValue(descriptor, pending.get(descriptor.id) ?? null)
  )

  const markPending = (id: string) => (pick: PendingPick | null) => {
    setPending((current) => {
      const next = new Map(current)
      if (pick === null) {
        next.delete(id)
      } else {
        next.set(id, pick)
      }
      return next
    })
  }

  return (
    <div
      role={mteWorker ? 'group' : undefined}
      aria-label={
        mteWorker
          ? translate('components.native-chat.composer.agentLabel.orchestrator', 'Orchestrator')
          : undefined
      }
      className="flex min-w-0 items-center text-chat-foreground-faint"
    >
      <SessionOptionPopover
        demandModelCatalog={surface.demandModelCatalog}
        model={model}
        options={options}
        isWorking={isWorking}
        pendingIds={new Set(pending.keys())}
        request={pickerRequest ?? null}
        onSet={(descriptor, value) =>
          runSessionOptionSurfaceCall(
            { id: descriptor.id, value },
            markPending(descriptor.id),
            () => surface.setOption(descriptor.id, value)
          )
        }
        onAction={(descriptor) =>
          runSessionOptionSurfaceCall({ id: descriptor.id }, markPending(descriptor.id), () =>
            surface.invokeAction(descriptor.id)
          )
        }
        focusComposer={focusComposer}
        agent={agent}
        mteWorker={mteWorker}
        worktreeId={worktreeId}
        onSwitchHarness={onSwitchHarness}
      />
    </div>
  )
}

export const NativeChatSessionOptionPickers = memo(NativeChatSessionOptionPickersInner)
