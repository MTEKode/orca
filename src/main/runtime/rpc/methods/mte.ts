import { defineMethod } from '../core'
import { MtePrepareWorkspaceParams } from '../../../../shared/rpc-contract/mte-params'
import { resolveMteStartCliCommand } from '../../../../shared/mte/cli-command'
import {
  applyWorkspaceMcpConfig,
  planWorkspaceMcpConfig
} from '../../../../shared/mte/mcp/workspace-mcp-config'

export const MTE_METHODS = [
  defineMethod({
    name: 'mte.prepareWorkspace',
    permission: 'workspace',
    params: MtePrepareWorkspaceParams,
    handler: async (params) => {
      const plan = planWorkspaceMcpConfig({
        adapter: params.adapter,
        workspaceRoot: params.workspaceRoot,
        // Why: the main process has no CLI entry in argv[1]; fall back to the PATH command.
        orcaCliCommand: resolveMteStartCliCommand(process.env, 'orca'),
        role: 'orchestrator'
      })
      const status = plan.nextContent === null ? 'already correct' : 'written'
      await applyWorkspaceMcpConfig(plan)
      return { configPath: plan.configPath, status }
    }
  })
]
