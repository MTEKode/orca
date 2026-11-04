import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { NativeChatMteWorkerPicker } from './NativeChatMteWorkerPicker'
import { persistMteWorkerChange } from './mte-worker-change'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { isMteWorkerPin, type MteWorkerPin } from '../../../../shared/mte/worker-pin'

/** The worker pinned on an MTE planner chat; undefined for plain chats or until the host answers. */
type PinTransport = { sessionId: string; runtimeEnvironmentId: string | null; worktreeId?: string }

function useMteWorkerPinState(
  transport: PinTransport | undefined
): [MteWorkerPin | undefined, (worker: MteWorkerPin) => void] {
  const sessionId = transport?.sessionId
  const environmentId = transport?.runtimeEnvironmentId ?? null
  const [pin, setPin] = useState<{ sessionId: string; worker: MteWorkerPin } | null>(null)
  useEffect(() => {
    if (!sessionId) {
      return
    }
    let cancelled = false
    // Async + try/catch so a missing, throwing, or non-promise RPC (tests, plain chats) yields no pin.
    void (async () => {
      try {
        const result = await callRuntimeRpc<{ worker: unknown } | null | undefined>(
          runtimeTargetForOwnerEnvironment(environmentId),
          'mte.getPlannerPin',
          { sessionId }
        )
        if (!cancelled && isMteWorkerPin(result?.worker)) {
          setPin({ sessionId, worker: result.worker })
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
  return [pin && pin.sessionId === sessionId ? pin.worker : undefined, set]
}

export function useMteWorkerPin(transport: PinTransport | undefined): MteWorkerPin | undefined {
  return useMteWorkerPinState(transport)[0]
}

/** The chat's agent plus, on an MTE planner chat, the worker pin and the composer selector that edits it. */
export function useComposerAgentIdentity(
  agent: string,
  transport: PinTransport | undefined
): { agent: string; mteWorker?: MteWorkerPin; mteWorkerPicker?: ReactNode } {
  const [mteWorker, setMteWorker] = useMteWorkerPinState(transport)
  if (!mteWorker || !transport) {
    return { agent }
  }
  const change = (worker: MteWorkerPin): void => {
    setMteWorker(worker)
    void persistMteWorkerChange(transport, worker)
  }
  return {
    agent,
    mteWorker,
    mteWorkerPicker: (
      <NativeChatMteWorkerPicker
        worker={mteWorker}
        worktreeId={transport.worktreeId}
        onChange={change}
      />
    )
  }
}
