import { app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { installMteFlow, uninstallMteFlow } from './installer'

/** Mirrors the experimental MTE Flow switch onto the user's home directory; failures are logged, never thrown. */
export async function applyMteFlowSetting(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      const resourcesDir = app.isPackaged
        ? join(process.resourcesPath, 'mte-flow')
        : join(app.getAppPath(), 'resources/mte-flow')
      await installMteFlow({ home: homedir(), resourcesDir })
    } else {
      await uninstallMteFlow({ home: homedir() })
    }
  } catch (error) {
    console.warn('[mte-flow] failed to apply setting:', error)
  }
}

/** `before` is undefined at startup: refresh the installed files after an app update when enabled. */
export async function syncMteFlowSetting(
  before: Pick<GlobalSettings, 'experimentalMteFlow'> | undefined,
  after: Pick<GlobalSettings, 'experimentalMteFlow'> | undefined
): Promise<void> {
  const enabled = after?.experimentalMteFlow === true
  if (before === undefined ? enabled : (before.experimentalMteFlow === true) !== enabled) {
    await applyMteFlowSetting(enabled)
  }
}
