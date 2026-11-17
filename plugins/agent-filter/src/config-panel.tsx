import { plugin, components } from 'orca'

interface Agent {
  id: string
  name: string
  description: string
}

interface Config {
  enabledAgents: string[]
  defaultSurface: string
}

export default function AgentFilterConfigPanel() {
  const [availableAgents, setAvailableAgents] = components.useState<Agent[]>([])
  const [config, setConfig] = components.useState<Config>({
    enabledAgents: [],
    defaultSurface: 'chat'
  })
  const [loading, setLoading] = components.useState(true)

  components.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [agents, currentConfig] = await Promise.all([
        plugin.request('agentFilter.getAvailableAgents'),
        plugin.request('agentFilter.getConfig')
      ])
      setAvailableAgents(agents)
      setConfig(currentConfig)
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleAgent = (agentId: string) => {
    setConfig(prev => {
      const enabled = prev.enabledAgents.includes(agentId)
      const newEnabled = enabled
        ? prev.enabledAgents.filter(id => id !== agentId)
        : [...prev.enabledAgents, agentId]
      
      const newConfig = { ...prev, enabledAgents: newEnabled }
      plugin.request('agentFilter.setConfig', newConfig)
      return newConfig
    })
  }

  const setDefaultSurface = (surface: string) => {
    const newConfig = { ...config, defaultSurface: surface }
    setConfig(newConfig)
    plugin.request('agentFilter.setConfig', newConfig)
  }

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Loading configuration...</p>
      </div>
    )
  }

  return (
    <components.ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Agent Filter</h2>
          <p className="text-sm text-muted-foreground">
            Configure which agents are available in your catalog
          </p>
        </div>

        {/* Agent Selection */}
        <components.Card>
          <components.CardHeader>
            <components.CardTitle>Enabled Agents</components.CardTitle>
            <components.CardDescription>
              Select which agents to show in the catalog
            </components.CardDescription>
          </components.CardHeader>
          <components.CardContent>
            <div className="space-y-3">
              {availableAgents.map(agent => (
                <div key={agent.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <components.Checkbox
                      checked={config.enabledAgents.includes(agent.id)}
                      onCheckedChange={() => toggleAgent(agent.id)}
                    />
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </components.CardContent>
        </components.Card>

        {/* Default Surface */}
        <components.Card>
          <components.CardHeader>
            <components.CardTitle>Default Interface</components.CardTitle>
            <components.CardDescription>
              Choose the default interface for new agent sessions
            </components.CardDescription>
          </components.CardHeader>
          <components.CardContent>
            <div className="flex gap-2">
              <components.Button
                variant={config.defaultSurface === 'chat' ? 'default' : 'outline'}
                onClick={() => setDefaultSurface('chat')}
              >
                Chat
              </components.Button>
              <components.Button
                variant={config.defaultSurface === 'terminal' ? 'default' : 'outline'}
                onClick={() => setDefaultSurface('terminal')}
              >
                Terminal
              </components.Button>
            </div>
          </components.CardContent>
        </components.Card>

        {/* Info */}
        <components.Alert>
          <components.AlertTitle>Configuration Saved</components.AlertTitle>
          <components.AlertDescription>
            Changes take effect immediately. Restart Orca if agents don't appear.
          </components.AlertDescription>
        </components.Alert>
      </div>
    </components.ScrollArea>
  )
}
