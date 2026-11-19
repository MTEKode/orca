import type { ComponentProps, ReactElement } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { matchesSettingsSearch } from '../search/settings-search'
import { SettingsSectionStack } from '../section-layout/SettingsSectionStack'
import {
  getAccountsCursorSearchEntries,
  getAccountsGrokSearchEntries,
  getAccountsMiniMaxSearchEntries,
  getAccountsZcodePlanSearchEntries
} from './accounts-search'
import { GrokAccountsSection } from './providers/GrokAccountsSection'
import { CursorAccountsSection } from './providers/CursorAccountsSection'
import { ManagedDataAccountsSection } from './providers/ManagedDataAccountsSection'
import { ZcodePlanAccountsSection } from './usage/ZcodePlanAccountsSection'
import { MiniMaxAccountsSection } from './usage/MiniMaxAccountsSection'

type MiniMaxProps = ComponentProps<typeof MiniMaxAccountsSection>

// ponytail: providers outside the fork's agent catalog stay functional but folded; delete them once their usage panes go.
export function AccountsOtherProviders({
  searchQuery,
  ownerKey,
  owner,
  usageHost,
  usageSettings,
  miniMaxRateLimits,
  recordFeatureInteraction,
  readsOwnerGrokCursor,
  gemini
}: {
  searchQuery: string
  ownerKey: string
  owner: ComponentProps<typeof ManagedDataAccountsSection>['target']
  usageHost: MiniMaxProps['host']
  usageSettings: MiniMaxProps['usageSettings']
  miniMaxRateLimits: MiniMaxProps['miniMaxRateLimits']
  recordFeatureInteraction: MiniMaxProps['recordFeatureInteraction']
  /** A desktop reads Grok/Cursor from its own files; the web client gets its server's meter. */
  readsOwnerGrokCursor: boolean
  /** Rendered by the pane, which owns the Gemini account model. */
  gemini: ReactElement | null
}): ReactElement | null {
  const t = useTranslate()
  const sections = [
    !searchQuery || /devin|account/i.test(searchQuery) ? (
      <ManagedDataAccountsSection key={`devin:${ownerKey}`} provider="devin" target={owner} />
    ) : null,
    gemini,
    matchesSettingsSearch(searchQuery, getAccountsMiniMaxSearchEntries()) ? (
      <MiniMaxAccountsSection
        key={`minimax:${ownerKey}`}
        host={usageHost}
        usageSettings={usageSettings}
        miniMaxRateLimits={miniMaxRateLimits}
        recordFeatureInteraction={recordFeatureInteraction}
      />
    ) : null,
    readsOwnerGrokCursor && matchesSettingsSearch(searchQuery, getAccountsGrokSearchEntries()) ? (
      <GrokAccountsSection key="grok" />
    ) : null,
    readsOwnerGrokCursor && matchesSettingsSearch(searchQuery, getAccountsCursorSearchEntries()) ? (
      <CursorAccountsSection key="cursor" />
    ) : null,
    matchesSettingsSearch(searchQuery, getAccountsZcodePlanSearchEntries()) ? (
      <ZcodePlanAccountsSection
        key={`zcode:${ownerKey}`}
        host={usageHost}
        usageSettings={usageSettings}
      />
    ) : null
  ]
  if (sections.every((section) => section === null)) {
    return null
  }
  return (
    // Search forces it open so matches are never hidden; deep links open it in scrollSubsectionIntoView.
    <details open={searchQuery ? true : undefined}>
      <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
        {t('accounts.otherProviders', 'Other providers')}
      </summary>
      <div className="mt-6">
        <SettingsSectionStack sections={sections} />
      </div>
    </details>
  )
}
