import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

// Mirrors FullGraphStatus from src/main/graphify/index.ts.
export type GraphifyStatus = {
  state: 'missing' | 'built'
  builtAt: number | null
  nodeCount: number
  edgeCount: number
  semantic: boolean
  running: 'build' | 'update' | null
  googleAiKeySet: boolean
  error?: string
}

export type GraphifySlice = {
  graphifyByRepo: Record<string, GraphifyStatus>
  graphifyLogByRepo: Record<string, string[]>
  graphifyGoogleAiKeySet: boolean
  refreshGraphify: (repoId: string) => Promise<void>
  buildGraphify: (repoId: string, deep: boolean) => Promise<void>
  updateGraphify: (repoId: string) => Promise<void>
  cancelGraphify: (repoId: string) => Promise<void>
  setGraphifyGoogleAiKey: (repoId: string | null, apiKey: string) => Promise<void>
  clearGraphifyGoogleAiKey: (repoId: string | null) => Promise<void>
}

const local = { kind: 'local' } as const
const rpc = <T>(method: string, params?: unknown): Promise<T> =>
  callRuntimeRpc<T>(local, method, params)

export const createGraphifySlice: StateCreator<AppState, [], [], GraphifySlice> = (set, get) => {
  const refresh = async (repoId: string): Promise<void> => {
    const status = await rpc<GraphifyStatus>('graphify.status', { repoId })
    // Why: the log tail is only worth fetching while a job runs (or just finished with an error).
    const log =
      status.running || status.error
        ? (await rpc<{ lines: string[] }>('graphify.log', { repoId })).lines
        : []
    set((s) => ({
      graphifyByRepo: { ...s.graphifyByRepo, [repoId]: status },
      graphifyLogByRepo: { ...s.graphifyLogByRepo, [repoId]: log },
      graphifyGoogleAiKeySet: status.googleAiKeySet
    }))
  }
  // Why: every mutation refetches so the UI shows the main process's truth, never a local guess.
  const act =
    (method: string, repoId: string, extra?: Record<string, unknown>) =>
    async (): Promise<void> => {
      await rpc(method, { repoId, ...extra })
      await refresh(repoId)
    }
  return {
    graphifyByRepo: {},
    graphifyLogByRepo: {},
    graphifyGoogleAiKeySet: false,
    refreshGraphify: refresh,
    buildGraphify: (repoId, deep) => act('graphify.build', repoId, { deep })(),
    updateGraphify: (repoId) => act('graphify.update', repoId)(),
    cancelGraphify: (repoId) => act('graphify.cancel', repoId)(),
    setGraphifyGoogleAiKey: async (repoId, apiKey) => {
      await rpc('graphify.setGoogleAiKey', { apiKey })
      if (repoId) {
        await get().refreshGraphify(repoId)
      } else {
        set({ graphifyGoogleAiKeySet: true })
      }
    },
    clearGraphifyGoogleAiKey: async (repoId) => {
      await rpc('graphify.clearGoogleAiKey')
      if (repoId) {
        await get().refreshGraphify(repoId)
      } else {
        set({ graphifyGoogleAiKeySet: false })
      }
    }
  }
}
