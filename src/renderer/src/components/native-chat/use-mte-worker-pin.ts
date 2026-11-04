import { useEffect, useState } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { isMteWorkerPin, type MteWorkerPin } from '../../../../shared/mte/worker-pin'

/** The worker pinned on an MTE planner chat; undefined for plain chats or until the host answers. */
export function useMteWorkerPin(
  transport: { sessionId: string; runtimeEnvironmentId: string | null } | undefined
): MteWorkerPin | undefined {
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
  return pin && pin.sessionId === sessionId ? pin.worker : undefined
}

/** The chat's agent plus, on an MTE planner chat, the worker its pill names beside it. */
export function useComposerAgentIdentity(
  agent: string,
  transport: Parameters<typeof useMteWorkerPin>[0]
): { agent: string; mteWorker?: MteWorkerPin } {
  const mteWorker = useMteWorkerPin(transport)
  return mteWorker ? { agent, mteWorker } : { agent }
}
