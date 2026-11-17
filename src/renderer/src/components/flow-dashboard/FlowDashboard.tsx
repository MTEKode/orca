import React, { useMemo } from 'react'
import { CheckCircle2, Circle, Loader2, XCircle, Workflow } from 'lucide-react'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { selectActiveFlowState, type FlowState, type FlowWorkerStatus } from '@/store/slices/agent-status/flow-dashboard-selector'

export function FlowDashboard(): React.JSX.Element {
  const t = useTranslate()
  const activeFlow = useAppStore(selectActiveFlowState)
  
  if (!activeFlow) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="space-y-2">
          <Workflow className="mx-auto size-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('flow.noActiveFlow', 'No active Flow')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('flow.startFlowHint', 'Start a Flow from the chat to orchestrate workers')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <FlowHeader flow={activeFlow} />
      <FlowTimeline flow={activeFlow} />
      <WorkersList flow={activeFlow} />
    </div>
  )
}

function FlowHeader({ flow }: { flow: FlowState }): React.JSX.Element {
  const t = useTranslate()
  
  const statusConfig = {
    planning: { icon: Loader2, label: t('flow.status.planning', 'Planning'), color: 'text-blue-500' },
    executing: { icon: Loader2, label: t('flow.status.executing', 'Executing'), color: 'text-amber-500' },
    validating: { icon: Loader2, label: t('flow.status.validating', 'Validating'), color: 'text-purple-500' },
    completed: { icon: CheckCircle2, label: t('flow.status.completed', 'Completed'), color: 'text-emerald-500' },
    failed: { icon: XCircle, label: t('flow.status.failed', 'Failed'), color: 'text-rose-500' },
    idle: { icon: Circle, label: t('flow.status.idle', 'Idle'), color: 'text-muted-foreground' }
  }

  const config = statusConfig[flow.status]
  const Icon = config.icon
  const duration = flow.completedAt
    ? Math.round((flow.completedAt - flow.startedAt) / 1000)
    : Math.round((Date.now() - flow.startedAt) / 1000)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Workflow className="size-5" />
              <CardTitle className="text-base">{t('flow.dashboard', 'Flow Dashboard')}</CardTitle>
            </div>
            <p className="text-sm font-medium">{flow.goal}</p>
          </div>
          <Badge variant={flow.status === 'completed' ? 'default' : 'secondary'}>
            <Icon className={`mr-1 size-3 ${config.color} ${flow.status === 'planning' || flow.status === 'executing' || flow.status === 'validating' ? 'animate-spin' : ''}`} />
            {config.label}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{t('flow.duration', 'Duration')}: {duration}s</span>
          <span>{t('flow.workers', 'Workers')}: {flow.workers.length}</span>
          {flow.completedAt && (
            <span>{t('flow.completedAt', 'Completed')}: {new Date(flow.completedAt).toLocaleTimeString()}</span>
          )}
        </div>
      </CardHeader>
    </Card>
  )
}

function FlowTimeline({ flow }: { flow: FlowState }): React.JSX.Element {
  const t = useTranslate()
  
  const stages = useMemo(() => {
    const stages = [
      { 
        id: 'planning', 
        label: t('flow.stage.planning', 'Planning'), 
        completed: flow.plannerPaneKey !== undefined && flow.status !== 'planning',
        active: flow.status === 'planning'
      },
      { 
        id: 'executing', 
        label: t('flow.stage.executing', 'Executing'), 
        completed: flow.status === 'validating' || flow.status === 'completed',
        active: flow.status === 'executing'
      },
      { 
        id: 'validating', 
        label: t('flow.stage.validating', 'Validating'), 
        completed: flow.status === 'completed',
        active: flow.status === 'validating'
      }
    ]
    return stages
  }, [flow, t])

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          {stages.map((stage, index) => (
            <React.Fragment key={stage.id}>
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`flex size-10 items-center justify-center rounded-full border-2 ${
                    stage.completed
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : stage.active
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-muted-foreground/30 text-muted-foreground'
                  }`}
                >
                  {stage.completed ? (
                    <CheckCircle2 className="size-5" />
                  ) : stage.active ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Circle className="size-5" />
                  )}
                </div>
                <span className="text-xs font-medium">{stage.label}</span>
              </div>
              {index < stages.length - 1 && (
                <div
                  className={`h-0.5 flex-1 ${
                    stage.completed ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function WorkersList({ flow }: { flow: FlowState }): React.JSX.Element {
  const t = useTranslate()
  
  if (flow.workers.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">
            {t('flow.noWorkers', 'No workers started yet')}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {t('flow.workers', 'Workers')} ({flow.completedWorkerCount}/{flow.workerCount})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {flow.workers.map((worker) => (
          <WorkerRow key={worker.id} worker={worker} />
        ))}
      </CardContent>
    </Card>
  )
}

function WorkerRow({ worker }: { worker: FlowWorkerStatus }): React.JSX.Element {
  const t = useTranslate()
  
  const statusConfig = {
    pending: { icon: Circle, label: t('flow.worker.pending', 'Pending'), color: 'text-muted-foreground' },
    running: { icon: Loader2, label: t('flow.worker.running', 'Running'), color: 'text-blue-500' },
    completed: { icon: CheckCircle2, label: t('flow.worker.completed', 'Completed'), color: 'text-emerald-500' },
    failed: { icon: XCircle, label: t('flow.worker.failed', 'Failed'), color: 'text-rose-500' }
  }

  const config = statusConfig[worker.status]
  const Icon = config.icon
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const duration = worker.completedAt && worker.startedAt
    ? Math.round((worker.completedAt - worker.startedAt) / 1000)
    : worker.startedAt
    ? Math.round((now - worker.startedAt) / 1000)
    : null

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Icon className={`size-5 ${config.color} ${worker.status === 'running' ? 'animate-spin' : ''}`} />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{worker.name}</span>
          <Badge variant="outline" className="text-xs">
            {worker.agent}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{config.label}</span>
          {duration !== null && <span>• {duration}s</span>}
          {worker.worktreeId && <span>• {worker.worktreeId}</span>}
        </div>
        {worker.error && (
          <p className="text-xs text-rose-500">{worker.error}</p>
        )}
      </div>
      {worker.status === 'failed' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              {t('flow.retryWorker', 'Retry')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t('flow.retryWorkerHint', 'Restart this worker')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
