import { useState } from 'react'
import { ExternalLink, LoaderCircle, Plug } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { McpIntegrationDefinition } from '../../../../shared/mcp-integrations/catalog'
import { IntegrationCardShell } from '../integrations/presentation/integration-card-shell'

function statusLabel(
  connected: boolean,
  method: 'oauth' | 'apiKey' | 'stdio' | null,
  informational = false
): string {
  if (informational) {
    return connected
      ? translate('auto.components.settings.McpIntegrationCard.graphsAvailable', 'Graphs available')
      : translate('auto.components.settings.McpIntegrationCard.noGraphs', 'No graphs built yet')
  }
  if (!connected) {
    return translate(
      'auto.components.settings.McpIntegrationCard.statusNotConnected',
      'Not connected'
    )
  }
  if (method === 'stdio') {
    return translate(
      'auto.components.settings.McpIntegrationCard.statusLocal',
      'Configured (local server)'
    )
  }
  return method === 'apiKey'
    ? translate('auto.components.settings.McpIntegrationCard.statusApiKey', 'Connected via API key')
    : translate('auto.components.settings.McpIntegrationCard.statusOAuth', 'Connected via OAuth')
}

export function McpIntegrationCard({
  definition
}: {
  definition: McpIntegrationDefinition
}): React.JSX.Element {
  const { id, label, auth, docsUrl } = definition
  const configFields = definition.transport === 'stdio' ? Object.entries(definition.config) : []
  const status = useAppStore((s) => s.mcpIntegrations.find((entry) => entry.id === id))
  const connect = useAppStore((s) => s.connectMcpIntegration)
  const saveKey = useAppStore((s) => s.setMcpIntegrationApiKey)
  const saveConfig = useAppStore((s) => s.setMcpIntegrationConfig)
  const disconnect = useAppStore((s) => s.disconnectMcpIntegration)
  const mountedRef = useMountedRef()
  const [busy, setBusy] = useState<'oauth' | 'key' | 'config' | 'disconnect' | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const stored = status?.config ?? {}
  const valueOf = (key: string): string => draft[key] ?? stored[key] ?? ''

  const pending = busy !== null
  const connected = status?.connected ?? false
  // Why: graphify has no credentials; its state follows built graphs, so the card only informs.
  const informational = id === 'graphify'
  const error = informational ? null : (status?.error ?? null)

  // Why: errors come from the RPC and never contain secrets; the key itself is cleared on success.
  const run = async (
    kind: 'oauth' | 'key' | 'config' | 'disconnect',
    action: () => Promise<{ ok: boolean; error?: string }>
  ): Promise<boolean> => {
    setBusy(kind)
    const result = await action()
    if (mountedRef.current) {
      setBusy(null)
    }
    if (!result.ok) {
      toast.error(
        result.error ??
          translate('auto.components.settings.McpIntegrationCard.failed', 'Request failed')
      )
    }
    return result.ok
  }

  const handleConnect = async (): Promise<void> => {
    if (await run('oauth', () => connect(id))) {
      toast.success(
        translate('auto.components.settings.McpIntegrationCard.connected', '{{label}} connected', {
          label
        })
      )
    }
  }
  const handleSave = async (): Promise<void> => {
    if (await run('key', () => saveKey(id, apiKey.trim()))) {
      if (mountedRef.current) {
        setApiKey('')
      }
      toast.success(
        translate(
          'auto.components.settings.McpIntegrationCard.keySaved',
          '{{label}} API key saved',
          { label }
        )
      )
    }
  }
  const handleSaveConfig = async (): Promise<void> => {
    const values = Object.fromEntries(configFields.map(([key]) => [key, valueOf(key).trim()]))
    if (await run('config', () => saveConfig(id, values))) {
      toast.success(
        translate(
          'auto.components.settings.McpIntegrationCard.configSaved',
          '{{label}} settings saved',
          { label }
        )
      )
    }
  }
  const handleDisconnect = async (): Promise<void> => {
    if (await run('disconnect', () => disconnect(id))) {
      toast.success(
        translate(
          'auto.components.settings.McpIntegrationCard.disconnected',
          '{{label}} disconnected',
          { label }
        )
      )
    }
  }

  return (
    <IntegrationCardShell
      icon={<Plug className="size-5" />}
      name={label}
      description={
        <>
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            translate(
              informational
                ? 'auto.components.settings.McpIntegrationCard.graphifyHint'
                : 'auto.components.settings.McpIntegrationCard.description',
              informational
                ? 'Build graphs from the Graph panel or `orca graph build`.'
                : 'Exposed to agents as MCP tools.'
            )
          )}{' '}
          <button
            type="button"
            className="inline-flex items-center gap-0.5 underline underline-offset-2"
            onClick={() => void window.api.shell.openUrl(docsUrl)}
          >
            {translate('auto.components.settings.McpIntegrationCard.docs', 'Docs')}
            <ExternalLink className="size-3" />
          </button>
        </>
      }
      statusTone={connected ? 'connected' : error ? 'attention' : 'neutral'}
      statusLabel={statusLabel(connected, status?.method ?? null, informational)}
      actions={
        <>
          {auth.oauth ? (
            <Button
              variant={connected ? 'outline' : 'default'}
              size="sm"
              disabled={pending}
              onClick={() => void handleConnect()}
            >
              {busy === 'oauth' ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {translate('auto.components.settings.McpIntegrationCard.connect', 'Connect')}
            </Button>
          ) : null}
          {connected && !informational ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void handleDisconnect()}
            >
              {translate('auto.components.settings.McpIntegrationCard.disconnect', 'Disconnect')}
            </Button>
          ) : null}
        </>
      }
    >
      {busy === 'oauth' ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.McpIntegrationCard.completeSignIn',
            'Complete the sign-in in your browser'
          )}
        </p>
      ) : null}
      {configFields.length > 0 ? (
        <div className="mt-3 flex items-center gap-2">
          {configFields.map(([key, field]) => (
            <Input
              key={key}
              autoComplete="off"
              value={valueOf(key)}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              placeholder={field.placeholder}
              aria-label={field.label}
            />
          ))}
          <Button
            size="sm"
            disabled={pending || configFields.some(([key]) => valueOf(key).trim() === '')}
            onClick={() => void handleSaveConfig()}
          >
            {translate('auto.components.settings.McpIntegrationCard.saveConfig', 'Save')}
          </Button>
        </div>
      ) : null}
      {auth.apiKey ? (
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={translate(
              'auto.components.settings.McpIntegrationCard.keyPlaceholder',
              'API key'
            )}
            aria-label={translate(
              'auto.components.settings.McpIntegrationCard.keyLabel',
              '{{label}} API key',
              { label }
            )}
          />
          <Button
            size="sm"
            disabled={pending || apiKey.trim() === ''}
            onClick={() => void handleSave()}
          >
            {translate('auto.components.settings.McpIntegrationCard.saveKey', 'Save key')}
          </Button>
        </div>
      ) : null}
    </IntegrationCardShell>
  )
}
