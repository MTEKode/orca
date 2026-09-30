import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { resetLspClients } from '@/lib/lsp/lsp-session-opener'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { SettingsBadge, SettingsRow, SettingsSwitchRow } from './SettingsFormControls'
import { SearchableSetting } from './SearchableSetting'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { LANGUAGE_SERVER_CATALOG } from '../../../../shared/language-server-catalog'
import type {
  LanguageServerId,
  LanguageServerProbe,
  LspProbeResult
} from '../../../../shared/language-server-types'
import type { Repo } from '../../../../shared/repo-types'

type RubyChoice = 'off' | 'ruby-lsp' | 'solargraph'
type Props = {
  repo: Repo
  updateRepo: (repoId: string, updates: Pick<Repo, 'languageServers'>) => void | Promise<boolean>
  forceVisible: boolean
}
const KEY = 'auto.components.settings.RepositoryLanguageServersSection'

function ServerStatus({
  probe
}: {
  probe: LanguageServerProbe | undefined
}): React.JSX.Element | null {
  if (!probe) {
    return null
  }
  switch (probe.status) {
    case 'bundled':
      return <SettingsBadge>{translate(`${KEY}.bundled`, 'Bundled')}</SettingsBadge>
    case 'installed':
      return <SettingsBadge>{probe.version}</SettingsBadge>
    case 'missing':
      return (
        <SettingsBadge tone="muted">
          {translate(`${KEY}.notInstalled`, 'Not installed')}
        </SettingsBadge>
      )
    case 'unsupported-host':
      return null
  }
}

export function RepositoryLanguageServersSection({
  repo,
  updateRepo,
  forceVisible
}: Props): React.JSX.Element {
  const [probe, setProbe] = useState<LspProbeResult | null>(null)
  const isLocal = getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
  const settings = repo.languageServers
  useEffect(() => {
    let cancelled = false
    void window.api.lsp.probe({ repoId: repo.id }).then(
      (result) => {
        if (!cancelled) {
          setProbe(result)
        }
      },
      () => {
        if (!cancelled) {
          setProbe(null)
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [repo.id, settings?.command])

  const setEnabled = (next: Partial<Record<LanguageServerId, boolean>>): void => {
    // Why: running sessions only restart once the new setting is actually persisted.
    void Promise.resolve(
      updateRepo(repo.id, {
        languageServers: { ...settings, enabled: { ...settings?.enabled, ...next } }
      })
    ).then((ok) => {
      if (ok !== false) {
        resetLspClients()
      }
    })
  }
  const rubyChoice: RubyChoice = settings?.enabled?.['ruby-lsp']
    ? 'ruby-lsp'
    : settings?.enabled?.solargraph
      ? 'solargraph'
      : 'off'

  return (
    <SearchableSetting
      title={translate(`${KEY}.title`, 'Language Servers')}
      description={translate(
        `${KEY}.description`,
        'Go to definition, find references and hover for this project. Enabling a server runs code from this repository.'
      )}
      keywords={[
        repo.displayName,
        'lsp',
        'language server',
        'go to definition',
        'references',
        'ruby',
        'typescript'
      ]}
      className="space-y-1"
      forceVisible={forceVisible}
    >
      {!isLocal && (
        <p className="text-muted-foreground text-xs">
          {translate(`${KEY}.localOnly`, 'Language servers are available for local projects only.')}
        </p>
      )}
      <SettingsSwitchRow
        label={translate(`${KEY}.typescript`, 'TypeScript / JavaScript')}
        description={<ServerStatus probe={probe?.typescript} />}
        checked={Boolean(settings?.enabled?.typescript)}
        disabled={!isLocal}
        onChange={() => setEnabled({ typescript: !settings?.enabled?.typescript })}
      />
      <SettingsRow
        label={translate(`${KEY}.ruby`, 'Ruby')}
        labelId={`lsp-ruby-${repo.id}`}
        description={
          rubyChoice === 'off' ? undefined : <ServerStatus probe={probe?.[rubyChoice]} />
        }
        control={
          <Select
            value={rubyChoice}
            disabled={!isLocal}
            onValueChange={(value) =>
              setEnabled({ 'ruby-lsp': value === 'ruby-lsp', solargraph: value === 'solargraph' })
            }
          >
            <SelectTrigger className="w-40" aria-labelledby={`lsp-ruby-${repo.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">{translate(`${KEY}.off`, 'Off')}</SelectItem>
              <SelectItem value="ruby-lsp">{LANGUAGE_SERVER_CATALOG['ruby-lsp'].label}</SelectItem>
              <SelectItem value="solargraph">{LANGUAGE_SERVER_CATALOG.solargraph.label}</SelectItem>
            </SelectContent>
          </Select>
        }
      />
    </SearchableSetting>
  )
}
