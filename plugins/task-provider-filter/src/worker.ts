import type { OrcaWorkerApi } from 'orca/worker'

export default async function activate(orca: OrcaWorkerApi) {
  orca.log('Task Provider Filter plugin activated')
  
  orca.commands.register('taskProviderFilter.getConfig', async () => {
    const enabledProviders = await orca.settings.get('enabledProviders')
    return {
      enabledProviders: (enabledProviders as string).split(',').map(s => s.trim())
    }
  })
  
  orca.commands.register('taskProviderFilter.setConfig', async (params: { enabledProviders: string[] }) => {
    await orca.settings.set('enabledProviders', params.enabledProviders.join(','))
    return { success: true }
  })
  
  orca.commands.register('taskProviderFilter.getAvailableProviders', async () => {
    return [
      { id: 'github', name: 'GitHub', description: 'GitHub Issues and PRs' },
      { id: 'linear', name: 'Linear', description: 'Linear issues and projects' },
      { id: 'jira', name: 'Jira', description: 'Jira issues (coming soon)' },
      { id: 'asana', name: 'Asana', description: 'Asana tasks (coming soon)' }
    ]
  })
}

export async function deactivate() {
  // Cleanup if needed
}
