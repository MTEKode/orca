import { describe, expect, it, vi } from 'vitest'
import { eraseRpcMethods, type RpcContext } from '../core'

const applyImportSelection = vi.hoisted(() => vi.fn(async () => []))
vi.mock('../../../skills/harness-skill-import', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  applyImportSelection
}))
import { SKILL_IMPORT_METHODS } from './skills-import'

function run(importedHarnessSkills: { enabled: boolean; selected: string[] }) {
  const updateSettings = vi.fn()
  const store = { getSettings: () => ({ importedHarnessSkills }), updateSettings }
  const method = eraseRpcMethods(SKILL_IMPORT_METHODS).find(
    (entry) => entry.name === 'skills.importApply'
  )
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: handler reads only requireStore.
  const context = { runtime: { requireStore: () => store } } as unknown as RpcContext
  return { result: method!.handler({ selected: [] }, context), updateSettings }
}

describe('skills.importApply', () => {
  it('refuses with a typed error while importing is disabled', async () => {
    const { result, updateSettings } = run({ enabled: false, selected: ['codex:a'] })
    await expect(result).rejects.toMatchObject({ code: 'harness_skill_import_disabled' })
    expect(applyImportSelection).not.toHaveBeenCalled()
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('passes the persisted selection as the ownership ledger when enabled', async () => {
    await run({ enabled: true, selected: ['codex:a'] }).result
    expect(applyImportSelection).toHaveBeenCalledWith([], ['codex:a'])
  })
})
