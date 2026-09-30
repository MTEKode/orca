import { useCallback, useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { resetLspClients } from '@/lib/lsp/lsp-session-opener'
import { Badge } from '../ui/badge'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Switch } from '../ui/switch'
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
      return <Badge variant="secondary">{translate(`${KEY}.bundled`, 'Bundled')}</Badge>
    case 'installed':
      return <Badge variant="secondary">{probe.version}</Badge>
    case 'missing':
      return <Badge variant="outline">{translate(`${KEY}.notInstalled`, 'Not installed')}</Badge>
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
  const refreshProbe = useCallback(() => {
    void window.api.lsp.probe({ repoId: repo.id }).then(setProbe, () => setProbe(null))
  }, [repo.id])
  useEffect(refreshProbe, [refreshProbe, settings?.command])

  const setEnabled = (next: Partial<Record<LanguageServerId, boolean>>): void => {
    void updateRepo(repo.id, {
      languageServers: { ...settings, enabled: { ...settings?.enabled, ...next } }
    })
    resetLspClients()
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
      className="space-y-3"
      forceVisible={forceVisible}
    >
      {!isLocal && (
        <p className="text-muted-foreground text-xs">
          {translate(`${KEY}.localOnly`, 'Language servers are available for local projects only.')}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor={`lsp-typescript-${repo.id}`}>
            {translate(`${KEY}.typescript`, 'TypeScript / JavaScript')}
          </Label>
          <ServerStatus probe={probe?.typescript} />
        </div>
        <Switch
          id={`lsp-typescript-${repo.id}`}
          checked={Boolean(settings?.enabled?.typescript)}
          disabled={!isLocal}
          onCheckedChange={(checked) => setEnabled({ typescript: checked })}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Label>{translate(`${KEY}.ruby`, 'Ruby')}</Label>
          <ServerStatus probe={rubyChoice === 'off' ? undefined : probe?.[rubyChoice]} />
        </div>
        <Select
          value={rubyChoice}
          disabled={!isLocal}
          onValueChange={(value) =>
            setEnabled({ 'ruby-lsp': value === 'ruby-lsp', solargraph: value === 'solargraph' })
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">{translate(`${KEY}.off`, 'Off')}</SelectItem>
            <SelectItem value="ruby-lsp">{LANGUAGE_SERVER_CATALOG['ruby-lsp'].label}</SelectItem>
            <SelectItem value="solargraph">{LANGUAGE_SERVER_CATALOG.solargraph.label}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </SearchableSetting>
  )
}
