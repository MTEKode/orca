import type { Repo } from '../../shared/repo-types'
import { resolve } from 'node:path'
import type { RegisteredWorktreeRootStore as Store } from './registered-worktree-root-store'
import {
  resolveRegisteredOwnerForRepo,
  resolveRegisteredWorktreePath
} from './registered-worktree-roots-cache'

export async function resolveRegisteredWorktreePathForRepo(
  worktreePath: string,
  repo: Repo,
  store: Store
): Promise<string> {
  const resolvedPath = await resolveRegisteredWorktreePath(worktreePath, store)
  const owner = resolveRegisteredOwnerForRepo(store, repo)
  if (
    owner &&
    (resolvedPath === resolve(repo.path) ||
      owner.listed?.has(resolvedPath) ||
      owner.recovered.has(resolvedPath) ||
      owner.aliases.has(resolvedPath))
  ) {
    return resolvedPath
  }
  throw new Error('Access denied: worktree is not owned by the requesting repository')
}
