import React, { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import { PRIMARY_AGENTS } from '../../../../../shared/agent-launch/catalog/primary-agents'
import { TUI_AGENT_DISPLAY_NAMES } from '../../../../../shared/agent-launch/catalog/tui-agent-display-names'

type Detection =
  | { state: 'checking' }
  | { state: 'failed' }
  | { state: 'done'; installed: ReadonlySet<string> }

/** Health of one agent from the CLI probe; a probe that is pending or failed is a warning, not an error. */
export function agentHealthStatus(
  agentId: string,
  detection: Detection
): 'healthy' | 'warning' | 'error' {
  if (detection.state !== 'done') {
    return 'warning'
  }
  return detection.installed.has(agentId) ? 'healthy' : 'error'
}

export function AgentHealthDashboard(): React.JSX.Element {
  const t = useTranslate()
  const [detection, setDetection] = useState<Detection>({ state: 'checking' })

  const detect = useCallback((refresh: boolean) => {
    setDetection({ state: 'checking' })
    const store = useAppStore.getState()
    // Includes agents the user disabled: health is about the CLI being installed, not offered.
    const probe = refresh
      ? store.refreshAllDetectedAgents(undefined, { wakeWslDistro: true })
      : store.ensureAllDetectedAgents()
    let stale = false
    probe.then(
      (ids) => !stale && setDetection({ state: 'done', installed: new Set<string>(ids) }),
      () => !stale && setDetection({ state: 'failed' })
    )
    return () => {
      stale = true
    }
  }, [])

  useEffect(() => detect(false), [detect])

  const checking = detection.state === 'checking'
  const agents = PRIMARY_AGENTS.map((agentId) => {
    const status = agentHealthStatus(agentId, detection)
    const message =
      status === 'healthy'
        ? t('agents.health.ready', 'Ready to use')
        : status === 'error'
          ? t('agents.health.notInstalled', 'CLI not found on this computer')
          : checking
            ? t('agents.health.checking', 'Checking…')
            : t('agents.health.checkFailed', 'Could not check installed agents')
    return { id: agentId, name: TUI_AGENT_DISPLAY_NAMES[agentId] ?? agentId, status, message }
  })

  const healthyCount = agents.filter((a) => a.status === 'healthy').length
  const warningCount = agents.filter((a) => a.status === 'warning').length
  const errorCount = agents.filter((a) => a.status === 'error').length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{t('agents.health.title', 'Agent health')}</CardTitle>
          <Button variant="ghost" size="sm" disabled={checking} onClick={() => detect(true)}>
            <RefreshCw className={checking ? 'mr-2 size-3 animate-spin' : 'mr-2 size-3'} />
            {t('agents.health.refresh', 'Refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            <span>
              {healthyCount} {t('agents.health.healthy', 'healthy')}
            </span>
          </div>
          {warningCount > 0 && !checking && (
            <div className="flex items-center gap-1.5">
              <AlertCircle className="size-3.5 text-amber-500" />
              <span>
                {warningCount} {t('agents.health.warnings', 'warnings')}
              </span>
            </div>
          )}
          {errorCount > 0 && (
            <div className="flex items-center gap-1.5">
              <XCircle className="size-3.5 text-rose-500" />
              <span>
                {errorCount} {t('agents.health.errors', 'errors')}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {agents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-3 rounded-lg border p-3">
              {agent.status === 'healthy' && (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              )}
              {agent.status === 'warning' && (
                <AlertCircle className="size-4 shrink-0 text-amber-500" />
              )}
              {agent.status === 'error' && <XCircle className="size-4 shrink-0 text-rose-500" />}
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
