import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  DeployCheckEncryptionUnavailableError,
  clearDeployCheckPassword,
  hasDeployCheckPassword,
  saveDeployCheckPassword
} from '../../mte/deploy-check-password-store'

export type DeployCheckSetResult = { ok: true } | { ok: false; reason: 'encryption-unavailable' }

const RepoIdArgs = z.object({ repoId: z.string().min(1) })
const SetArgs = RepoIdArgs.extend({ password: z.string().min(1).max(4_096) })

export function registerDeployCheckPasswordHandlers(): void {
  ipcMain.removeHandler('repos:deployCheckPassword:set')
  ipcMain.removeHandler('repos:deployCheckPassword:clear')
  ipcMain.removeHandler('repos:deployCheckPassword:has')
  ipcMain.handle('repos:deployCheckPassword:set', (_event, args: unknown): DeployCheckSetResult => {
    const { repoId, password } = SetArgs.parse(args)
    try {
      saveDeployCheckPassword(repoId, password)
    } catch (error) {
      if (error instanceof DeployCheckEncryptionUnavailableError) {
        return { ok: false, reason: error.reason }
      }
      throw error
    }
    return { ok: true }
  })
  ipcMain.handle('repos:deployCheckPassword:clear', (_event, args: unknown) => {
    clearDeployCheckPassword(RepoIdArgs.parse(args).repoId)
  })
  ipcMain.handle('repos:deployCheckPassword:has', (_event, args: unknown): boolean =>
    hasDeployCheckPassword(RepoIdArgs.parse(args).repoId)
  )
}
