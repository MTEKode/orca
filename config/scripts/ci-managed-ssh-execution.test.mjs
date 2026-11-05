import { expect, it } from 'vitest'
import { MANAGED_SSH_E2E_SPEC_PREFIX } from './ci-e2e-job-selection.mjs'
import { selectPrE2eSpecs } from './pr-e2e-source-routing.mjs'

it('keeps shared SSH fixtures on the full suite but excludes the experimental sidebar spec', () => {
  for (const file of [
    'tests/e2e/helpers/orcad-managed-workspace.ts',
    'tests/e2e/helpers/paired-host-terminal.ts'
  ]) {
    expect(selectPrE2eSpecs([file])).toContain(MANAGED_SSH_E2E_SPEC_PREFIX)
  }
  for (const file of [
    'tests/e2e/ssh-orcad-phone-feed-list.spec.ts',
    'tests/e2e/helpers/phone-feed-list.ts',
    'tests/e2e/helpers/sidebar-inputs-build.ts',
    'src/shared/sidebar-list/sidebar-feed-list.ts'
  ]) {
    expect(
      selectPrE2eSpecs([file]).some((spec) => spec.startsWith(MANAGED_SSH_E2E_SPEC_PREFIX)),
      file
    ).toBe(false)
  }
})
