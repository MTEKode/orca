import type { OrcaWorkerApi } from 'orca/worker'

export default async function activate(orca: OrcaWorkerApi) {
  orca.log('Agent Filter plugin activated')
  
  // Register commands
  orca.commands.register('agentFilter.getConfig', async () => {
    const enabledAgents = await orca.settings.get('enabledAgents')
    const defaultSurface = await orca.settings.get('defaultSurface')
    return {
      enabledAgents: (enabledAgents as string).split(',').map(s => s.trim()),
      defaultSurface
    }
  })
  
  orca.commands.register('agentFilter.setConfig', async (params: { enabledAgents: string[], defaultSurface: string }) => {
    await orca.settings.set('enabledAgents', params.enabledAgents.join(','))
    await orca.settings.set('defaultSurface', params.defaultSurface)
    return { success: true }
  })
  
  orca.commands.register('agentFilter.getAvailableAgents', async () => {
    return [
      { id: 'claude', name: 'Claude', description: 'Anthropic Claude' },
      { id: 'codex', name: 'Codex', description: 'OpenAI Codex' },
      { id: 'opencode', name: 'OpenCode', description: 'OpenCode agent' },
      { id: 'pi', name: 'Pi', description: 'Pi agent' },
      { id: 'antigravity', name: 'Antigravity', description: 'Antigravity agent' }
    ]
  })
}

export async function deactivate() {
  // Cleanup if needed
}
