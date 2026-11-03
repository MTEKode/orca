import {
  MTE_DEPLOY_CHECK_DEFAULT_DONE_STATE,
  deployCheckLinearCommentBody,
  type MteDeployCheckConfig,
  type MteDeployCheckReport
} from '../../shared/mte/deploy-check'
import type { Repo } from '../../shared/repo-types'
import { errorMessage } from '../../shared/error-message'

export type DeployCheckWorktree = {
  repoId: string
  linkedLinearIssue?: string | null
  linkedLinearIssueWorkspaceId?: string | null
}

export type DeployCheckServiceDeps = {
  resolveWorktree: (workspaceRoot: string) => Promise<DeployCheckWorktree | null>
  getRepo: (repoId: string) => Repo | undefined
  readPassword: (repoId: string) => string | null
  addComment: (args: { input: string; workspaceId?: string; body: string }) => Promise<unknown>
  setState: (args: { input: string; workspaceId?: string; to: string }) => Promise<unknown>
}

export async function resolveDeployCheckConfig(
  deps: DeployCheckServiceDeps,
  workspaceRoot: string
): Promise<MteDeployCheckConfig> {
  const worktree = await deps.resolveWorktree(workspaceRoot)
  const settings = worktree ? deps.getRepo(worktree.repoId)?.deployCheck : undefined
  const password = worktree ? deps.readPassword(worktree.repoId) : null
  if (!worktree || !settings?.url.trim() || !settings.username.trim() || password === null) {
    return { configured: false }
  }
  return {
    configured: true,
    url: settings.url.trim(),
    username: settings.username.trim(),
    password,
    linearDoneState: settings.linearDoneState?.trim() || MTE_DEPLOY_CHECK_DEFAULT_DONE_STATE
  }
}

/** Posts the deploy-check result on the worktree's linked Linear issue and moves it when it passed. */
export async function reportDeployCheck(
  deps: DeployCheckServiceDeps,
  params: { workspaceRoot: string; summary: string; ok: boolean }
): Promise<MteDeployCheckReport> {
  const worktree = await deps.resolveWorktree(params.workspaceRoot)
  const issue = worktree?.linkedLinearIssue?.trim()
  if (!worktree || !issue) {
    return { linear: 'skipped-no-issue' }
  }
  const workspaceId = worktree.linkedLinearIssueWorkspaceId ?? undefined
  try {
    await deps.addComment({
      input: issue,
      workspaceId,
      body: deployCheckLinearCommentBody(params.summary, params.ok)
    })
  } catch (error) {
    return { linear: `failed:${errorMessage(error)}` }
  }
  if (!params.ok) {
    return { linear: 'commented' }
  }
  const to =
    deps.getRepo(worktree.repoId)?.deployCheck?.linearDoneState?.trim() ||
    MTE_DEPLOY_CHECK_DEFAULT_DONE_STATE
  try {
    await deps.setState({ input: issue, workspaceId, to })
  } catch (error) {
    return { linear: `failed:commented but could not move to ${to}: ${errorMessage(error)}` }
  }
  return { linear: 'commented+moved' }
}
