import { defineMethod } from '../core'
import {
  MteDeployCheckConfigParams,
  MteDeployCheckReportParams
} from '../../../../shared/rpc-contract/mte-params'
import {
  reportDeployCheck,
  resolveDeployCheckConfig,
  type DeployCheckServiceDeps
} from '../../../mte/deploy-check-service'
import { readDeployCheckPassword } from '../../../mte/deploy-check-password-store'
import type { OrcaRuntimeService } from '../../orca-runtime'

function buildDeps(runtime: OrcaRuntimeService, signal?: AbortSignal): DeployCheckServiceDeps {
  return {
    resolveWorktree: (root) => runtime.resolveWorktreeForContainedPath(root),
    getRepo: (repoId) => runtime.listRepos().find((repo) => repo.id === repoId),
    readPassword: readDeployCheckPassword,
    addComment: (args) => runtime.linearIssueAddComment(args, signal),
    setState: (args) => runtime.linearIssueSetState(args, signal)
  }
}

export const MTE_DEPLOY_CHECK_METHODS = [
  defineMethod({
    name: 'mte.deployCheckConfig',
    permission: 'workspace',
    params: MteDeployCheckConfigParams,
    handler: async (params, { runtime }) =>
      resolveDeployCheckConfig(buildDeps(runtime), params.workspaceRoot)
  }),
  defineMethod({
    name: 'mte.deployCheckReport',
    permission: 'workspace',
    params: MteDeployCheckReportParams,
    handler: async (params, { runtime, signal }) =>
      reportDeployCheck(buildDeps(runtime, signal), params)
  })
]
