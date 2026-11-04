import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { buildCurrentWorktreeSelector, getRequiredWorktreeSelector } from '../selectors'
import type { RuntimeWorktreeRecord } from '../../shared/runtime-types'

type GraphStatus = {
  state: 'missing' | 'built'
  builtAt: number | null
  nodeCount: number
  edgeCount: number
  semantic: boolean
}

// Resolves the workspace to the repo graphify indexes (one graph per repo, not per worktree).
async function resolveRepoId({ flags, client, cwd }: HandlerContext): Promise<string> {
  const selector = flags.has('worktree')
    ? await getRequiredWorktreeSelector(flags, 'worktree', cwd, client)
    : buildCurrentWorktreeSelector(cwd)
  const { worktree } = (
    await client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', { worktree: selector })
  ).result
  return worktree.repoId
}

const formatStatus = (s: GraphStatus): string =>
  s.state === 'missing'
    ? 'No graph yet. Run: orca graph build'
    : `Graph built ${new Date(s.builtAt ?? 0).toISOString()}: ${s.nodeCount} nodes, ${s.edgeCount} edges${s.semantic ? ' (semantic)' : ' (code only)'}`

const start =
  (method: 'graphify.build' | 'graphify.update'): CommandHandler =>
  async (ctx) => {
    const repoId = await resolveRepoId(ctx)
    const params =
      method === 'graphify.build' ? { repoId, deep: ctx.flags.get('deep') === true } : { repoId }
    const res = await ctx.client.call<{ started: boolean }>(method, params)
    printResult(
      res,
      ctx.json,
      () => `Started ${method.slice(9)} for ${repoId}. Check: orca graph status`
    )
  }

export const GRAPH_HANDLERS: Record<string, CommandHandler> = {
  'graph build': start('graphify.build'),
  'graph update': start('graphify.update'),
  'graph status': async (ctx) => {
    const repoId = await resolveRepoId(ctx)
    printResult(
      await ctx.client.call<GraphStatus>('graphify.status', { repoId }),
      ctx.json,
      formatStatus
    )
  },
  'graph open': async (ctx) => {
    const repoId = await resolveRepoId(ctx)
    const res = await ctx.client.call<{ url: string }>('graphify.openViewer', { repoId })
    try {
      // Best effort: the viewer path is still printed when no embedded browser is available.
      await ctx.client.call('browser.tabCreate', { url: res.result.url, activate: true })
    } catch {
      // Headless host or old runtime.
    }
    printResult(res, ctx.json, (v) => v.url)
  }
}
