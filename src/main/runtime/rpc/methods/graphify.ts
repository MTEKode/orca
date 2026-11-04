import { defineMethod } from '../core'
import {
  GraphifyBuildParams,
  GraphifyRepoParams,
  GraphifySetGoogleAiKeyParams
} from '../../../../shared/rpc-contract/graphify-params'
import {
  cancel,
  clearGoogleAiKey,
  getGraphifyLog,
  readFullStatus,
  startBuild,
  startUpdate,
  viewerUrl,
  writeGoogleAiKey
} from '../../../graphify'
import type { OrcaRuntimeService } from '../../orca-runtime'

function repoRootOf(runtime: OrcaRuntimeService, repoId: string): string {
  const repo = runtime.requireStore().getRepo(repoId)
  if (!repo) {
    throw new Error(`Unknown repo: ${repoId}`)
  }
  return repo.path
}

export const GRAPHIFY_METHODS = [
  defineMethod({
    name: 'graphify.status',
    permission: 'workspace',
    params: GraphifyRepoParams,
    handler: async (params) => readFullStatus(params.repoId)
  }),
  defineMethod({
    name: 'graphify.build',
    permission: 'workspace',
    params: GraphifyBuildParams,
    handler: async (params, { runtime }) => {
      startBuild({
        repoId: params.repoId,
        repoRoot: repoRootOf(runtime, params.repoId),
        deep: params.deep
      })
      return { started: true }
    }
  }),
  defineMethod({
    name: 'graphify.update',
    permission: 'workspace',
    params: GraphifyRepoParams,
    handler: async (params, { runtime }) => {
      startUpdate({ repoId: params.repoId, repoRoot: repoRootOf(runtime, params.repoId) })
      return { started: true }
    }
  }),
  defineMethod({
    name: 'graphify.cancel',
    permission: 'workspace',
    params: GraphifyRepoParams,
    handler: async (params) => ({ cancelled: cancel(params.repoId) })
  }),
  defineMethod({
    name: 'graphify.log',
    permission: 'workspace',
    params: GraphifyRepoParams,
    handler: async (params) => ({ lines: getGraphifyLog(params.repoId) })
  }),
  defineMethod({
    name: 'graphify.setGoogleAiKey',
    permission: 'accounts-admin',
    params: GraphifySetGoogleAiKeyParams,
    handler: async (params) => {
      writeGoogleAiKey(params.apiKey)
      return { ok: true }
    }
  }),
  defineMethod({
    name: 'graphify.clearGoogleAiKey',
    permission: 'accounts-admin',
    params: null,
    handler: async () => {
      clearGoogleAiKey()
      return { ok: true }
    }
  }),
  defineMethod({
    name: 'graphify.openViewer',
    permission: 'workspace',
    params: GraphifyRepoParams,
    handler: async (params) => ({ url: viewerUrl(params.repoId) })
  })
]
