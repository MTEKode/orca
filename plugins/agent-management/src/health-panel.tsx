import { plugin, components, host, on } from 'orca'

interface AgentHealth {
  id: string
  name: string
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  lastSeen: number | null
  message?: string
}

export default function AgentHealthPanel() {
  const [agents, setAgents] = components.useState<AgentHealth[]>([])

  components.useEffect(() => {
    loadAgents()
    
    const unsubscribe = on('agent.status.changed', ({ terminalId, state }) => {
      setAgents(prev => prev.map(a => 
        a.id === terminalId 
          ? { ...a, status: mapState(state), lastSeen: Date.now() }
          : a
      ))
    })
    
    return () => unsubscribe?.dispose()
  }, [])

  const mapState = (state: string): AgentHealth['status'] => {
    if (state === 'working') return 'healthy'
    if (state === 'waiting') return 'warning'
    if (state === 'blocked') return 'error'
    if (state === 'done') return 'healthy'
    return 'unknown'
  }

  const loadAgents = async () => {
    try {
      const result = await host.call('agents.list')
      const healthList: AgentHealth[] = result.agents.map(a => ({
        id: a.terminalId || a.title || 'unknown',
        name: a.title || 'Unknown Agent',
        status: 'unknown',
        lastSeen: null
      }))
      setAgents(healthList)
    } catch (error) {
      console.error('Failed to load agents:', error)
    }
  }

  const getStatusColor = (status: AgentHealth['status']) => {
    switch (status) {
      case 'healthy': return 'text-green-500'
      case 'warning': return 'text-yellow-500'
      case 'error': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  return (
    <components.ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Agent Health</h2>
          <p className="text-sm text-muted-foreground">
            Real-time status of active agents
          </p>
        </div>

        {agents.length === 0 ? (
          <components.Card>
            <components.CardContent className="pt-6">
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  No active agents
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Start an agent to see its health status
                </p>
              </div>
            </components.CardContent>
          </components.Card>
        ) : (
          <div className="space-y-2">
            {agents.map(agent => (
              <components.Card key={agent.id}>
                <components.CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${getStatusColor(agent.status)}`} />
                      <div>
                        <p className="font-medium">{agent.name}</p>
                        {agent.lastSeen && (
                          <p className="text-xs text-muted-foreground">
                            Last seen: {new Date(agent.lastSeen).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <components.Badge variant="outline">
                      {agent.status}
                    </components.Badge>
                  </div>
                  {agent.message && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {agent.message}
                    </p>
                  )}
                </components.CardContent>
              </components.Card>
            ))}
          </div>
        )}
      </div>
    </components.ScrollArea>
  )
}
