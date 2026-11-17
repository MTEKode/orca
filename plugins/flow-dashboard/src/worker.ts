import { plugin, on, host, atom, read, set, update } from 'orca'

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
  worktreeName?: string
}

interface TimelineEntry {
  timestamp: number
  event: string
  agent: string
  details?: string
}

const flowState = atom<FlowState>({
  orchestrationRunId: null,
  planner: null,
  workers: [],
  timeline: [],
  status: 'idle'
})

export default function setup() {
  // Listen for agent status changes
  on('agent.status.changed', async ({ terminalId, title, state }) => {
    const agents = await host.call('agents.list')
    update(flowState, (current) => {
      // Detect orchestration run from agent titles
      const orchestrationAgents = agents.agents.filter(a => 
        a.title?.includes('orchestrator') || 
        a.title?.includes('planner') ||
        a.title?.includes('worker')
      )
      
      if (orchestrationAgents.length > 0) {
        const planner = orchestrationAgents.find(a => 
          a.title?.includes('planner') || a.title?.includes('orchestrator')
        )
        const workers = orchestrationAgents.filter(a => 
          a.title?.includes('worker')
        )
        
        return {
          ...current,
          orchestrationRunId: `run-${Date.now()}`,
          planner: planner ? {
            terminalId: planner.terminalId,
            title: planner.title,
            state: state
          } : null,
          workers: workers.map(w => ({
            terminalId: w.terminalId,
            title: w.title,
            state: state
          })),
          status: state === 'working' ? 'running' : 
                  state === 'done' ? 'completed' : 
                  current.status,
          timeline: [
            ...current.timeline,
            {
              timestamp: Date.now(),
              event: 'status-changed',
              agent: title || 'unknown',
              details: state
            }
          ].slice(-50) // Keep last 50 events
        }
      }
      
      return current
    })
  })

  // Listen for workspace changes
  on('workspace.changed', async () => {
    const agents = await host.call('agents.list')
    const orchestrationAgents = agents.agents.filter(a => 
      a.title?.includes('orchestrator') || 
      a.title?.includes('planner') ||
      a.title?.includes('worker')
    )
    
    if (orchestrationAgents.length === 0) {
      set(flowState, {
        orchestrationRunId: null,
        planner: null,
        workers: [],
        timeline: [],
        status: 'idle'
      })
    }
  })
}

// Panel request handlers
plugin.handle('flow.getState', () => read(flowState))

plugin.handle('flow.reset', () => {
  set(flowState, {
    orchestrationRunId: null,
    planner: null,
    workers: [],
    timeline: [],
    status: 'idle'
  })
})
