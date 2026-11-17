import { plugin, components } from 'orca'
import { setup } from './worker'

setup()

interface FlowState {
  orchestrationRunId: string | null
  planner: AgentInfo | null
  workers: AgentInfo[]
  timeline: TimelineEntry[]
  status: 'idle' | 'planning' | 'running' | 'completed' | 'failed'
}

interface AgentInfo {
  terminalId: string | null
  title: string | null
  state: string
}

interface TimelineEntry {
  timestamp: number
  event: string
  agent: string
  details?: string
}

export default function FlowDashboardPanel() {
  const [state, setState] = components.useState<FlowState>({
    orchestrationRunId: null,
    planner: null,
    workers: [],
    timeline: [],
    status: 'idle'
  })

  components.useEffect(() => {
    plugin.request('flow.getState').then(setState)
    
    const interval = setInterval(() => {
      plugin.request('flow.getState').then(setState)
    }, 2000)
    
    return () => clearInterval(interval)
  }, [])

  const handleReset = () => {
    plugin.request('flow.reset').then(() => {
      setState({
        orchestrationRunId: null,
        planner: null,
        workers: [],
        timeline: [],
        status: 'idle'
      })
    })
  }

  return (
    <components.ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Flow Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Real-time orchestration monitoring
            </p>
          </div>
          <components.Button onClick={handleReset} variant="outline" size="sm">
            Reset
          </components.Button>
        </div>

        {/* Status Card */}
        <components.Card>
          <components.CardHeader>
            <components.CardTitle>Status</components.CardTitle>
          </components.CardHeader>
          <components.CardContent>
            <div className="flex items-center gap-2">
              <components.Badge variant={
                state.status === 'idle' ? 'secondary' :
                state.status === 'running' ? 'default' :
                state.status === 'completed' ? 'success' :
                state.status === 'failed' ? 'destructive' : 'outline'
              }>
                {state.status.toUpperCase()}
              </components.Badge>
              {state.orchestrationRunId && (
                <span className="text-xs text-muted-foreground">
                  {state.orchestrationRunId}
                </span>
              )}
            </div>
          </components.CardContent>
        </components.Card>

        {/* Planner */}
        {state.planner && (
          <components.Card>
            <components.CardHeader>
              <components.CardTitle>Planner</components.CardTitle>
            </components.CardHeader>
            <components.CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <components.Badge variant="outline">
                    {state.planner.state}
                  </components.Badge>
                  <span className="text-sm">{state.planner.title}</span>
                </div>
              </div>
            </components.CardContent>
          </components.Card>
        )}

        {/* Workers */}
        {state.workers.length > 0 && (
          <components.Card>
            <components.CardHeader>
              <components.CardTitle>
                Workers ({state.workers.length})
              </components.CardTitle>
            </components.CardHeader>
            <components.CardContent>
              <div className="space-y-2">
                {state.workers.map((worker, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded bg-muted/50">
                    <components.Badge variant={
                      worker.state === 'working' ? 'default' :
                      worker.state === 'done' ? 'success' : 'secondary'
                    }>
                      {worker.state}
                    </components.Badge>
                    <span className="text-sm">{worker.title}</span>
                  </div>
                ))}
              </div>
            </components.CardContent>
          </components.Card>
        )}

        {/* Timeline */}
        {state.timeline.length > 0 && (
          <components.Card>
            <components.CardHeader>
              <components.CardTitle>Timeline</components.CardTitle>
            </components.CardHeader>
            <components.CardContent>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {state.timeline.slice().reverse().map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <components.Badge variant="outline" className="text-xs">
                      {entry.agent}
                    </components.Badge>
                    <span className="text-muted-foreground">
                      {entry.details}
                    </span>
                  </div>
                ))}
              </div>
            </components.CardContent>
          </components.Card>
        )}

        {/* Empty State */}
        {state.status === 'idle' && (
          <components.Card>
            <components.CardContent className="pt-6">
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  No active orchestration flow
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Start a flow from Settings → Orchestration
                </p>
              </div>
            </components.CardContent>
          </components.Card>
        )}
      </div>
    </components.ScrollArea>
  )
}
