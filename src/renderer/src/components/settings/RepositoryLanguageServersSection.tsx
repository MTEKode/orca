import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { resetLspClients } from '@/lib/lsp/lsp-session-opener'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { SettingsBadge, SettingsRow, SettingsSwitchRow } from './SettingsFormControls'
import { SearchableSetting } from './SearchableSetting'
import { LanguageServerInstallPanel } from './LanguageServerInstallPanel'
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
  const [installing, setInstalling] = useState<{
    serverId: LanguageServerId
    mode: 'install' | 'update'
  } | null>(null)
  const [probeNonce, setProbeNonce] = useState(0)
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
  }, [repo.id, settings?.command, probeNonce])

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
  const saveCommand = (serverId: LanguageServerId, text: string): void => {
    // Why: plain whitespace split; quoted paths with spaces are not supported.
    const argv = text.trim().split(/\s+/).filter(Boolean)
    const command = { ...settings?.command, [serverId]: argv.length > 0 ? argv : undefined }
    void Promise.resolve(updateRepo(repo.id, { languageServers: { ...settings, command } })).then(
      (ok) => {
        if (ok !== false) {
          resetLspClients()
        }
      }
    )
  }
  const rubyChoice: RubyChoice = settings?.enabled?.['ruby-lsp']
    ? 'ruby-lsp'
    : settings?.enabled?.solargraph
      ? 'solargraph'
      : 'off'

  const rubyProbe = rubyChoice === 'off' ? undefined : probe?.[rubyChoice]
  const rubyCommand = rubyChoice === 'off' ? '' : (settings?.command?.[rubyChoice]?.join(' ') ?? '')
  const rubyEntry = rubyChoice === 'off' ? null : LANGUAGE_SERVER_CATALOG[rubyChoice]

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
      {isLocal && rubyEntry?.kind === 'external' && rubyChoice !== 'off' && (
        <>
          {(rubyProbe?.status === 'missing' || rubyProbe?.status === 'installed') && (
            <SettingsRow
              label={translate(`${KEY}.manage`, 'Install or update')}
              control={
                rubyProbe.status === 'missing' ? (
                  <Button
                    size="sm"
                    onClick={() => setInstalling({ serverId: rubyChoice, mode: 'install' })}
                  >
                    {translate(`${KEY}.install`, 'Install')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInstalling({ serverId: rubyChoice, mode: 'update' })}
                  >
                    {translate(`${KEY}.update`, 'Update')}
                  </Button>
                )
              }
            />
          )}
          <SettingsRow
            label={translate(`${KEY}.customCommand`, 'Custom command')}
            labelId={`lsp-command-label-${repo.id}`}
            control={
              <Input
                key={`${rubyChoice}:${rubyCommand}`}
                className="w-64"
                aria-labelledby={`lsp-command-label-${repo.id}`}
                defaultValue={rubyCommand}
                placeholder={rubyEntry.defaultCommand.join(' ')}
                onBlur={(event) => saveCommand(rubyChoice, event.target.value)}
              />
            }
          />
          {installing && (
            <LanguageServerInstallPanel
              repoPath={repo.path}
              serverId={installing.serverId}
              mode={installing.mode}
              onFinished={() => {
                setInstalling(null)
                setProbeNonce((n) => n + 1)
              }}
            />
          )}
        </>
      )}
    </SearchableSetting>
  )
}
