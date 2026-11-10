import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { NativeChatMteWorkerPicker } from './NativeChatMteWorkerPicker'
import { persistMteWorkerChange } from './mte-worker-change'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/rpc/targets/runtime-client-target'
import { isMteWorkerPin, type MteWorkerPin } from '../../../../shared/mte/worker-pin'
import { isMteOrchestrationAgent } from '../../../../shared/mte/orchestration-agents'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'

/** The worker pinned on an MTE planner chat; undefined for plain chats or until the host answers. */
type PinTransport = {
  sessionId: string
  runtimeEnvironmentId: string | null
  worktreeId?: string
  onSwitchHarness?: (pick: {
    agent: TuiAgent
    model?: string
    effort?: string
  }) => void | Promise<void>
}

function useMteWorkerPinState(
  transport: PinTransport | undefined
): [{ worker?: MteWorkerPin } | undefined, (worker: MteWorkerPin) => void] {
  const sessionId = transport?.sessionId
  const environmentId = transport?.runtimeEnvironmentId ?? null
  const [pin, setPin] = useState<{ sessionId: string; worker?: MteWorkerPin } | null>(null)
  useEffect(() => {
    if (!sessionId) {
      return
    }
    let cancelled = false
    // Async + try/catch so a missing, throwing, or non-promise RPC (tests, plain chats) yields no pin.
    void (async () => {
      try {
        const result = await callRuntimeRpc<
          { planner?: boolean; worker: unknown } | null | undefined
        >(runtimeTargetForOwnerEnvironment(environmentId), 'mte.getPlannerPin', { sessionId })
        // A planner without a pin yet still gets the selector (worker undefined).
        if (!cancelled && (result?.planner === true || isMteWorkerPin(result?.worker))) {
          setPin({ sessionId, worker: isMteWorkerPin(result?.worker) ? result.worker : undefined })
        }
      } catch {
        // A failed read leaves the plain "Agent" label.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, environmentId])
  // `pin` is null before any answer; with no session `pin?.sessionId === sessionId` would be undefined === undefined.
  const set = useCallback(
    (worker: MteWorkerPin) => sessionId && setPin({ sessionId, worker }),
    [sessionId]
  )
  return [pin && pin.sessionId === sessionId ? pin : undefined, set]
}

export function useMteWorkerPin(transport: PinTransport | undefined): MteWorkerPin | undefined {
  return useMteWorkerPinState(transport)[0]?.worker
}

/** The chat's agent plus, on an MTE planner chat, the worker pin and the composer selector that edits it. */
export function useComposerAgentIdentity(
  agent: string,
  transport: PinTransport | undefined
): {
  agent: string
  mteWorker?: MteWorkerPin
  mteWorkerPicker?: ReactNode
  onSwitchHarness?: (pick: {
    agent: TuiAgent
    model?: string
    effort?: string
  }) => void | Promise<void>
} {
  const [planner, setMteWorker] = useMteWorkerPinState(transport)
  const onSwitchHarness = transport?.onSwitchHarness
  // ponytail: with no pin yet the selector starts on the chat's own agent (model/effort unset).
  const mteWorker = planner?.worker ?? (isMteOrchestrationAgent(agent) ? { agent } : undefined)
  if (!planner || !mteWorker || !transport) {
    return {
      agent,
      ...(onSwitchHarness ? { onSwitchHarness } : {})
    }
  }
  const change = (worker: MteWorkerPin): void => {
    setMteWorker(worker)
    void persistMteWorkerChange(transport, worker)
  }
  return {
    agent,
    mteWorker: planner.worker,
    mteWorkerPicker: (
      <NativeChatMteWorkerPicker
        worker={mteWorker}
        worktreeId={transport.worktreeId}
        onChange={change}
      />
    ),
    ...(onSwitchHarness ? { onSwitchHarness } : {})
  }
}
