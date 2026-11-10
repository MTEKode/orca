import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store'
import { useActiveRepo } from '../../../../cli/selectors'
import { translate } from '@/i18n/i18n'
import { IntegrationCardShell } from '../integrations/presentation/integration-card-shell'

/** Write-only: the stored key is never read back into the UI, so the input never pre-fills. */
export function GoogleAiKeyCard(): React.JSX.Element {
  const keySet = useAppStore((s) => s.graphifyGoogleAiKeySet)
  const saveKey = useAppStore((s) => s.setGraphifyGoogleAiKey)
  const clearKey = useAppStore((s) => s.clearGraphifyGoogleAiKey)
  const repoId = useActiveRepo()?.id ?? null
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>, onOk: () => void): Promise<void> => {
    setBusy(true)
    try {
      await action()
      onOk()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const handleSave = (): Promise<void> =>
    run(
      () => saveKey(repoId, apiKey.trim()),
      () => {
        setApiKey('')
        toast.success(translate('auto.components.settings.GoogleAiKeyCard.saved', 'API key saved'))
      }
    )
  const handleClear = (): Promise<void> =>
    run(
      () => clearKey(repoId),
      () => {}
    )

  return (
    <IntegrationCardShell
      icon={<KeyRound className="size-5" />}
      name={translate(
        'auto.components.settings.GoogleAiKeyCard.name',
        'Google AI (Gemini) API key'
      )}
      description={translate(
        'auto.components.settings.GoogleAiKeyCard.description',
        'Enables semantic extraction of docs when building knowledge graphs. Without it, graphs cover code only.'
      )}
      statusTone={keySet ? 'connected' : 'neutral'}
      statusLabel={
        keySet
          ? translate('auto.components.settings.GoogleAiKeyCard.stored', 'Key stored')
          : translate('auto.components.settings.GoogleAiKeyCard.notSet', 'Not set')
      }
      actions={
        keySet ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleClear()}>
            {translate('auto.components.settings.GoogleAiKeyCard.clear', 'Clear')}
          </Button>
        ) : null
      }
    >
      <div className="mt-3 flex items-center gap-2">
        <Input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={translate(
            'auto.components.settings.GoogleAiKeyCard.placeholder',
            'Paste Gemini API key'
          )}
          aria-label={translate(
            'auto.components.settings.GoogleAiKeyCard.name',
            'Google AI (Gemini) API key'
          )}
        />
        <Button size="sm" disabled={busy || apiKey.trim() === ''} onClick={() => void handleSave()}>
          {translate('auto.components.settings.GoogleAiKeyCard.save', 'Save')}
        </Button>
      </div>
    </IntegrationCardShell>
  )
}
