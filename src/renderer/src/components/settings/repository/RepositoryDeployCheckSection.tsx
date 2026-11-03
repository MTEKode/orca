import { useEffect, useState } from 'react'
import type { Repo } from '../../../../../shared/repo-types'
import { MTE_DEPLOY_CHECK_DEFAULT_DONE_STATE } from '../../../../../shared/mte/deploy-check'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { SearchableSetting } from '../SearchableSetting'
import { searchKeywords } from '../settings-search-keywords'
import { RepoSettingsDraftInput } from './RepositorySettingsDraftInput'

type DeployCheckValue = NonNullable<Repo['deployCheck']>

type RepositoryDeployCheckSectionProps = {
  repo: Repo
  updateRepo: (repoId: string, updates: Pick<Repo, 'deployCheck'>) => void
  forceVisible?: boolean
}

function DeployCheckPassword({ repoId }: { repoId: string }): React.JSX.Element {
  const [saved, setSaved] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Why: the bridge may be absent (tests, paired web clients); treat it as "no password".
    const bridge = window.api?.repos?.deployCheckPassword
    void bridge
      ?.has({ repoId })
      .then((has) => {
        if (!cancelled) {
          setSaved(has)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [repoId])

  const save = async (): Promise<void> => {
    const result = await window.api?.repos?.deployCheckPassword?.set({ repoId, password: draft })
    if (!result?.ok) {
      setError(true)
      return
    }
    setError(false)
    setDraft('')
    setSaved(true)
  }
  const clear = async (): Promise<void> => {
    await window.api?.repos?.deployCheckPassword?.clear({ repoId })
    setSaved(false)
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`deploy-check-password-${repoId}`}>
        {translate('settings.repository.deployCheck.password', 'Password')}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={`deploy-check-password-${repoId}`}
          type="password"
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-9 text-sm"
        />
        <Button size="sm" disabled={draft === ''} onClick={() => void save()}>
          {translate('settings.repository.deployCheck.save', 'Save password')}
        </Button>
        {saved ? (
          <Button size="sm" variant="outline" onClick={() => void clear()}>
            {translate('settings.repository.deployCheck.clear', 'Clear')}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {translate(
            'settings.repository.deployCheck.passwordError',
            'Could not save the password: secure storage is unavailable on this system.'
          )}
        </p>
      ) : null}
      {saved ? (
        <p className="text-xs text-muted-foreground">
          {translate('settings.repository.deployCheck.passwordSaved', 'Password saved')}
        </p>
      ) : null}
    </div>
  )
}

export function RepositoryDeployCheckSection({
  repo,
  updateRepo,
  forceVisible
}: RepositoryDeployCheckSectionProps): React.JSX.Element {
  const title = translate('settings.repository.deployCheck.title', 'Deploy check')
  const description = translate(
    'settings.repository.deployCheck.description',
    'Where the MTE flow tests the deployed feature after the last task passes, and which Linear state to move the issue to.'
  )
  const current: DeployCheckValue = repo.deployCheck ?? { url: '', username: '' }
  const patch = (next: Partial<DeployCheckValue>): void =>
    updateRepo(repo.id, { deployCheck: { ...current, ...next } })
  const field = (
    key: 'url' | 'username' | 'linearDoneState',
    label: string,
    placeholder?: string
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <Label htmlFor={`deploy-check-${key}-${repo.id}`}>{label}</Label>
      <RepoSettingsDraftInput
        id={`deploy-check-${key}-${repo.id}`}
        repoId={repo.id}
        storeValue={current[key] ?? ''}
        placeholder={placeholder}
        onTextChange={(text) => patch({ [key]: text })}
        className="h-9 text-sm"
      />
    </div>
  )
  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={searchKeywords([
        repo.displayName,
        { key: 'settings.repository.deployCheck.keywordDeploy', fallback: 'deploy' },
        { key: 'settings.repository.deployCheck.keywordStaging', fallback: 'staging' },
        { key: 'settings.repository.deployCheck.keywordLinear', fallback: 'linear' }
      ])}
      forceVisible={forceVisible}
      className="space-y-3 py-3"
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {field('url', translate('settings.repository.deployCheck.url', 'URL'), 'https://')}
      {field('username', translate('settings.repository.deployCheck.username', 'Username'))}
      <DeployCheckPassword repoId={repo.id} />
      {field(
        'linearDoneState',
        translate(
          'settings.repository.deployCheck.doneState',
          'Linear state after a passing check'
        ),
        MTE_DEPLOY_CHECK_DEFAULT_DONE_STATE
      )}
    </SearchableSetting>
  )
}
