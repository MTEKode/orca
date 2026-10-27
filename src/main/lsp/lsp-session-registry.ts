import type { Store } from '../persistence'
import { resolveRegisteredWorktreePathForRepo } from '../ipc/registered-worktree-path-for-repo'
import { LspSession } from './lsp-session'
import { LspSessionManager } from './lsp-session-manager'
import { resolveLspServerCommand } from './lsp-server-command'

let manager: LspSessionManager | null = null

/** Idempotent: macOS re-creates the window and re-runs service attachment. */
export function installLspSessionManager(store: Store): LspSessionManager {
  if (manager) {
    return manager
  }
  manager = new LspSessionManager({
    getRepo: (repoId) => store.getRepo(repoId),
    resolveWorktreeRoot: (worktreePath, repo) =>
      resolveRegisteredWorktreePathForRepo(worktreePath, repo, store),
    resolveCommand: (serverId, rootPath, settings) =>
      resolveLspServerCommand(serverId, rootPath, settings),
    createSession: (config) => new LspSession(config)
  })
  return manager
}

export function getLspSessionManager(): LspSessionManager | null {
  return manager
}
