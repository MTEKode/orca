import React from 'react'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTranslate } from '@/i18n/use-translate'
import { PRIMARY_AGENTS } from '../../../../../shared/agent-launch/catalog/primary-agents'
import { isMteOrchestrationAgent } from '../../../../../shared/mte/orchestration-agents'
import { TUI_AGENT_DISPLAY_NAMES } from '../../../../../shared/agent-launch/catalog/tui-agent-display-names'
import { agentChatPermissionModes } from '../../../../../shared/agent-launch/permissions/agent-chat-permission-support'

type AgentCapability = {
  id: string
  label: string
  supported: boolean
}

type AgentInfo = {
  id: string
  name: string
  capabilities: AgentCapability[]
}

export function AgentCompatibilityPanel(): React.JSX.Element {
  const t = useTranslate()

  const agents: AgentInfo[] = PRIMARY_AGENTS.map((agentId) => {
    const supportsPermissions = agentChatPermissionModes(agentId) !== undefined
    const supportsOrchestration = isMteOrchestrationAgent(agentId)

    return {
      id: agentId,
      name: TUI_AGENT_DISPLAY_NAMES[agentId] ?? agentId,
      capabilities: [
        {
          id: 'permissions',
          label: t('agents.capability.permissions', 'Permission control'),
          supported: supportsPermissions
        },
        {
          id: 'orchestration',
          label: t('agents.capability.orchestration', 'Flow orchestration'),
          supported: supportsOrchestration
        }
        // ponytail: no computer-use row; `orca computer` is a CLI any agent can call and no per-agent capability data exists. Add the row when such data does.
      ]
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {t('agents.compatibility.title', 'Agent capabilities')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium">{agent.name}</span>
                <Badge variant="outline" className="text-xs">
                  {agent.id}
                </Badge>
              </div>
              <div className="space-y-1.5">
                {agent.capabilities.map((cap) => (
                  <div key={cap.id} className="flex items-center gap-2 text-xs">
                    {cap.supported ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="size-3.5 text-muted-foreground" />
                    )}
                    <span className={cap.supported ? 'text-foreground' : 'text-muted-foreground'}>
                      {cap.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-muted/50 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <p className="text-xs text-muted-foreground">
              {t(
                'agents.compatibility.hint',
                'Not all agents support the same features. Check capabilities before configuring workflows.'
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
