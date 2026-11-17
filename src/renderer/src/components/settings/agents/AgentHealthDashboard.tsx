import React from 'react'
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import { TUI_AGENT_DISPLAY_NAMES } from '../../../../../shared/agent-launch/catalog/tui-agent-display-names'

type AgentHealth = {
  id: string
  name: string
  status: 'healthy' | 'warning' | 'error'
  message: string
  configured: boolean
}

export function AgentHealthDashboard(): React.JSX.Element {
  const t = useTranslate()
  const settings = useAppStore((s) => s.settings)

  const PRIMARY_AGENTS = ['claude', 'codex', 'opencode', 'pi', 'antigravity'] as const

  const agents: AgentHealth[] = PRIMARY_AGENTS.map((agentId) => {
    const agentSettings = settings?.agentLaunchSettings?.[agentId]
    const configured = agentSettings?.command !== undefined
    const hasCustomModel = agentSettings?.model !== undefined
    
    let status: 'healthy' | 'warning' | 'error' = 'healthy'
    let message = t('agents.health.ready', 'Ready to use')

    if (!configured) {
      status = 'warning'
      message = t('agents.health.notConfigured', 'Using default command')
    }

    if (hasCustomModel && agentId === 'pi') {
      status = 'error'
      message = t('agents.health.piModelNotSupported', 'Pi does not support model selection')
    }

    return {
      id: agentId,
      name: TUI_AGENT_DISPLAY_NAMES[agentId] ?? agentId,
      status,
      message,
      configured
    }
  })

  const healthyCount = agents.filter((a) => a.status === 'healthy').length
  const warningCount = agents.filter((a) => a.status === 'warning').length
  const errorCount = agents.filter((a) => a.status === 'error').length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            {t('agents.health.title', 'Agent health')}
          </CardTitle>
          <Button variant="ghost" size="sm">
            <RefreshCw className="mr-2 size-3" />
            {t('agents.health.refresh', 'Refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            <span>{healthyCount} {t('agents.health.healthy', 'healthy')}</span>
          </div>
          {warningCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertCircle className="size-3.5 text-amber-500" />
              <span>{warningCount} {t('agents.health.warnings', 'warnings')}</span>
            </div>
          )}
          {errorCount > 0 && (
            <div className="flex items-center gap-1.5">
              <XCircle className="size-3.5 text-rose-500" />
              <span>{errorCount} {t('agents.health.errors', 'errors')}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              {agent.status === 'healthy' && (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              )}
              {agent.status === 'warning' && (
                <AlertCircle className="size-4 shrink-0 text-amber-500" />
              )}
              {agent.status === 'error' && (
                <XCircle className="size-4 shrink-0 text-rose-500" />
              )}
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{agent.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {agent.id}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{agent.message}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
