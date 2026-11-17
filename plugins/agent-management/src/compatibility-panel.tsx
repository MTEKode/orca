import { plugin, components, host } from 'orca'

interface AgentCapability {
  name: string
  supported: boolean
  description: string
}

interface AgentInfo {
  id: string
  name: string
  capabilities: AgentCapability[]
}

const PRIMARY_AGENTS = ['claude', 'codex', 'opencode', 'pi', 'antigravity']

export default function AgentCompatibilityPanel() {
  const [agents, setAgents] = components.useState<AgentInfo[]>([])

  components.useEffect(() => {
    loadAgents()
  }, [])

  const loadAgents = async () => {
    const agentList = PRIMARY_AGENTS.map(id => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      capabilities: [
        { name: 'Orchestration', supported: true, description: 'Can coordinate other agents' },
        { name: 'Computer Use', supported: id === 'claude' || id === 'pi', description: 'Can control GUI' },
        { name: 'File Editing', supported: true, description: 'Can edit files directly' },
        { name: 'Terminal Access', supported: true, description: 'Can run shell commands' },
        { name: 'Web Browsing', supported: id !== 'opencode', description: 'Can browse the web' }
      ]
    }))
    setAgents(agentList)
  }

  return (
    <components.ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Agent Compatibility</h2>
          <p className="text-sm text-muted-foreground">
            Capabilities of your primary agents
          </p>
        </div>

        {agents.map(agent => (
          <components.Card key={agent.id}>
            <components.CardHeader>
              <components.CardTitle className="text-base">
                {agent.name}
              </components.CardTitle>
            </components.CardHeader>
            <components.CardContent>
              <div className="space-y-2">
                {agent.capabilities.map(cap => (
                  <div key={cap.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {cap.supported ? (
                        <components.CheckIcon className="h-4 w-4 text-green-500" />
                      ) : (
                        <components.XIcon className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm">{cap.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {cap.description}
                    </span>
                  </div>
                ))}
              </div>
            </components.CardContent>
          </components.Card>
        ))}
      </div>
    </components.ScrollArea>
  )
}
