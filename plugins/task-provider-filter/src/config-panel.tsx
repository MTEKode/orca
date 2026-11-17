import { plugin, components } from 'orca'

interface Provider {
  id: string
  name: string
  description: string
}

interface Config {
  enabledProviders: string[]
}

export default function TaskProviderConfigPanel() {
  const [availableProviders, setAvailableProviders] = components.useState<Provider[]>([])
  const [config, setConfig] = components.useState<Config>({
    enabledProviders: []
  })
  const [loading, setLoading] = components.useState(true)

  components.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [providers, currentConfig] = await Promise.all([
        plugin.request('taskProviderFilter.getAvailableProviders'),
        plugin.request('taskProviderFilter.getConfig')
      ])
      setAvailableProviders(providers)
      setConfig(currentConfig)
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleProvider = (providerId: string) => {
    setConfig(prev => {
      const enabled = prev.enabledProviders.includes(providerId)
      const newEnabled = enabled
        ? prev.enabledProviders.filter(id => id !== providerId)
        : [...prev.enabledProviders, providerId]
      
      const newConfig = { enabledProviders: newEnabled }
      plugin.request('taskProviderFilter.setConfig', newConfig)
      return newConfig
    })
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
          <h2 className="text-lg font-semibold">Task Providers</h2>
          <p className="text-sm text-muted-foreground">
            Configure which task providers are available
          </p>
        </div>

        <components.Card>
          <components.CardHeader>
            <components.CardTitle>Enabled Providers</components.CardTitle>
            <components.CardDescription>
              Select which task providers to enable
            </components.CardDescription>
          </components.CardHeader>
          <components.CardContent>
            <div className="space-y-3">
              {availableProviders.map(provider => (
                <div key={provider.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <components.Checkbox
                      checked={config.enabledProviders.includes(provider.id)}
                      onCheckedChange={() => toggleProvider(provider.id)}
                    />
                    <div>
                      <p className="font-medium">{provider.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {provider.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </components.CardContent>
        </components.Card>

        <components.Alert>
          <components.AlertTitle>Configuration Saved</components.AlertTitle>
          <components.AlertDescription>
            Changes take effect immediately. You may need to restart Orca for all changes to apply.
          </components.AlertDescription>
        </components.Alert>
      </div>
    </components.ScrollArea>
  )
}
