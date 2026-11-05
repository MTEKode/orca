import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import {
  IMPORT_ORIGIN_ORDER,
  type ImportableSkill,
  type ImportableSkillOrigin
} from '../../../../shared/skills/importable-skill'
import { SettingsSwitchRow } from './form-controls/SettingsFormControls'

const LOCAL_TARGET = { kind: 'local' } as const

function originLabel(origin: ImportableSkillOrigin): string {
  switch (origin) {
    case 'claude-home':
      return translate('auto.components.settings.skillsImport.originClaude', 'Claude home')
    case 'codex':
      return translate('auto.components.settings.skillsImport.originCodex', 'Codex')
    case 'opencode':
      return translate('auto.components.settings.skillsImport.originOpenCode', 'OpenCode')
    case 'cursor':
      return translate('auto.components.settings.skillsImport.originCursor', 'Cursor')
    case 'antigravity':
      return translate('auto.components.settings.skillsImport.originAntigravity', 'Antigravity')
    case 'plugins':
      return translate('auto.components.settings.skillsImport.originPlugins', 'Plugins')
    default:
      return translate('auto.components.settings.skillsImport.originOther', 'Other')
  }
}

function disabledReason(skill: ImportableSkill): string | null {
  if (skill.state === 'conflict') {
    return translate(
      'auto.components.settings.skillsImport.conflict',
      'A different skill with this name already exists in ~/.agents/skills.'
    )
  }
  return skill.state === 'broken'
    ? translate(
        'auto.components.settings.skillsImport.broken',
        'The source skill is missing. Uncheck to clean up the link.'
      )
    : null
}

export function ImportHarnessSkillsCard(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const enabled = settings?.importedHarnessSkills?.enabled === true
  const selected = settings?.importedHarnessSkills?.selected ?? []
  const [skills, setSkills] = useState<ImportableSkill[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (method: string, params: unknown): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await callRuntimeRpc<{ skills: ImportableSkill[] }>(
        LOCAL_TARGET,
        method,
        params
      )
      setSkills(result.skills)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string, checked: boolean): void => {
    const next = checked ? [...new Set([...selected, id])] : selected.filter((s) => s !== id)
    void run('skills.importApply', { selected: next })
  }

  return (
    <section className="space-y-3 py-5">
      <SettingsSwitchRow
        label={translate(
          'auto.components.settings.skillsImport.title',
          'Import skills from other harnesses'
        )}
        description={translate(
          'auto.components.settings.skillsImport.description',
          'Link skills from Claude, Codex, OpenCode, Cursor, Antigravity, and plugins into ~/.agents/skills so every chat sees them. Turning this off keeps existing links. Not available for WSL.'
        )}
        checked={enabled}
        onChange={() =>
          void updateSettings({ importedHarnessSkills: { enabled: !enabled, selected } })
        }
      />
      {enabled ? (
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void run('skills.importableList', {})}
          >
            <RefreshCw className="size-3.5" />
            {translate('auto.components.settings.skillsImport.sync', 'Sync')}
          </Button>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {skills?.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.skillsImport.empty',
                'No skills found in other harnesses.'
              )}
            </p>
          ) : null}
          {IMPORT_ORIGIN_ORDER.map((origin) => {
            const group = (skills ?? []).filter((skill) => skill.origin === origin)
            return group.length === 0 ? null : (
              <div
                key={origin}
                className="space-y-1.5"
                role="group"
                aria-label={originLabel(origin)}
              >
                <h4 className="text-xs font-medium text-muted-foreground">{originLabel(origin)}</h4>
                {group.map((skill) => {
                  const reason = disabledReason(skill)
                  const linked = skill.state === 'linked'
                  return (
                    <label key={skill.id} className="flex items-start gap-2">
                      <Checkbox
                        checked={linked || selected.includes(skill.id)}
                        disabled={busy || skill.state === 'conflict'}
                        onCheckedChange={(value) => toggle(skill.id, value === true)}
                        aria-label={skill.name}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="block text-sm">{skill.name}</span>
                        {skill.description ? (
                          <span className="block text-xs text-muted-foreground">
                            {skill.description}
                          </span>
                        ) : null}
                        {reason ? (
                          <span className="block text-xs text-muted-foreground">{reason}</span>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
