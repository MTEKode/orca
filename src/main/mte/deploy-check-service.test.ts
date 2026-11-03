import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import {
  reportDeployCheck,
  resolveDeployCheckConfig,
  type DeployCheckServiceDeps,
  type DeployCheckWorktree
} from './deploy-check-service'

function makeDeps(
  worktree: DeployCheckWorktree | null,
  overrides: Partial<DeployCheckServiceDeps> = {}
): DeployCheckServiceDeps {
  const repo = {
    id: 'repo-1',
    deployCheck: { url: 'https://app.test', username: 'bot', linearDoneState: 'Shipped' }
  } as unknown as Repo
  return {
    resolveWorktree: vi.fn().mockResolvedValue(worktree),
    getRepo: vi.fn().mockReturnValue(repo),
    readPassword: vi.fn().mockReturnValue('pw'),
    addComment: vi.fn().mockResolvedValue({}),
    setState: vi.fn().mockResolvedValue({}),
    ...overrides
  }
}

const linked: DeployCheckWorktree = {
  repoId: 'repo-1',
  linkedLinearIssue: 'ENG-7',
  linkedLinearIssueWorkspaceId: 'ws-1'
}

describe('reportDeployCheck', () => {
  it('comments and moves the issue when validation passed', async () => {
    const deps = makeDeps(linked)
    const result = await reportDeployCheck(deps, { workspaceRoot: '/w', summary: 'ok', ok: true })
    expect(result).toEqual({ linear: 'commented+moved' })
    expect(deps.addComment).toHaveBeenCalledWith({
      input: 'ENG-7',
      workspaceId: 'ws-1',
      body: 'Deploy validated by Orca MTE flow:\n\nok'
    })
    expect(deps.setState).toHaveBeenCalledWith({
      input: 'ENG-7',
      workspaceId: 'ws-1',
      to: 'Shipped'
    })
  })

  it('only comments when validation failed', async () => {
    const deps = makeDeps(linked)
    const result = await reportDeployCheck(deps, { workspaceRoot: '/w', summary: 'bad', ok: false })
    expect(result).toEqual({ linear: 'commented' })
    expect(deps.setState).not.toHaveBeenCalled()
  })

  it('skips when the worktree has no linked issue', async () => {
    const deps = makeDeps({ repoId: 'repo-1' })
    const result = await reportDeployCheck(deps, { workspaceRoot: '/w', summary: 's', ok: true })
    expect(result).toEqual({ linear: 'skipped-no-issue' })
    expect(deps.addComment).not.toHaveBeenCalled()
  })

  it('reports a failure reason when Linear rejects the comment', async () => {
    const deps = makeDeps(linked, { addComment: vi.fn().mockRejectedValue(new Error('nope')) })
    const result = await reportDeployCheck(deps, { workspaceRoot: '/w', summary: 's', ok: true })
    expect(result).toEqual({ linear: 'failed:nope' })
    expect(deps.setState).not.toHaveBeenCalled()
  })
})

describe('resolveDeployCheckConfig', () => {
  it('returns the decrypted config for a configured project', async () => {
    expect(await resolveDeployCheckConfig(makeDeps(linked), '/w')).toEqual({
      configured: true,
      url: 'https://app.test',
      username: 'bot',
      password: 'pw',
      linearDoneState: 'Shipped'
    })
  })

  it('is unconfigured without a saved password or worktree', async () => {
    const noPw = makeDeps(linked, { readPassword: vi.fn().mockReturnValue(null) })
    expect(await resolveDeployCheckConfig(noPw, '/w')).toEqual({ configured: false })
    expect(await resolveDeployCheckConfig(makeDeps(null), '/w')).toEqual({ configured: false })
  })
})
