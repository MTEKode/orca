import { defineMethod } from '../core'
import {
  SkillsImportApplyParams,
  SkillsImportableListParams
} from '../../../../shared/rpc-contract/skills-params'
import { applyImportSelection, listImportableSkills } from '../../../skills/harness-skill-import'

/** Node-only: importing links skills from other harness homes into ~/.agents/skills. */
export const SKILL_IMPORT_METHODS = [
  defineMethod({
    name: 'skills.importableList',
    permission: 'workspace',
    params: SkillsImportableListParams,
    handler: async (_params, { runtime }) => ({
      skills: await listImportableSkills(
        runtime.requireStore().getSettings().importedHarnessSkills?.selected
      )
    })
  }),
  defineMethod({
    name: 'skills.importApply',
    permission: 'skills-admin',
    params: SkillsImportApplyParams,
    handler: async (params, { runtime }) => {
      const store = runtime.requireStore()
      const selected = [...new Set(params.selected)]
      const skills = await applyImportSelection(selected)
      const enabled = store.getSettings().importedHarnessSkills?.enabled === true
      store.updateSettings?.(
        { importedHarnessSkills: { enabled, selected } },
        { notifyListeners: true }
      )
      return { skills }
    }
  })
]
