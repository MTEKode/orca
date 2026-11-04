import { defineMethod } from '../core'
import { getStructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/structured-agent-session-registry'
import { MTE_DEPLOY_CHECK_METHODS } from './mte-deploy-check'
import {
  MteGetPlannerPinParams,
  MteMarkPlannerParams,
  MtePrepareWorkspaceParams
} from '../../../../shared/rpc-contract/mte-params'
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
  }),
  defineMethod({
    // Marks a renderer-launched chat as an MTE planner (the CLI path marks it inside agent.launch).
    name: 'mte.markPlanner',
    permission: 'workspace',
    params: MteMarkPlannerParams,
    handler: async (params, { runtime }) => {
      await runtime.ensureStructuredAgentSessionHost()
      await getStructuredAgentSessionHost()?.deps.store.markMtePlanner(
        params.sessionId,
        params.worker
      )
      return { ok: true }
    }
  }),
  defineMethod({
    // Lets the composer label show the worker pinned on an MTE planner chat; null for plain chats.
    name: 'mte.getPlannerPin',
    permission: 'workspace',
    params: MteGetPlannerPinParams,
    handler: async (params, { runtime }) => {
      await runtime.ensureStructuredAgentSessionHost()
      const record = getStructuredAgentSessionHost()?.deps.store.getRecord(params.sessionId)
      return { worker: record?.mteRole === 'planner' ? (record.mteWorker ?? null) : null }
    }
  }),
  ...MTE_DEPLOY_CHECK_METHODS
]
