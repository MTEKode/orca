import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useAppStore } from '@/store'
import { useActiveRepo } from '../../../../cli/selectors'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { openHtmlFileInBrowser } from '@/components/terminal-pane/links/files/terminal-html-file-browser-open'

function relativeTime(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(getIntlLocale(), { numeric: 'auto' })
  if (minutes < 60) {
    return rtf.format(-minutes, 'minute')
  }
  return minutes < 1440
    ? rtf.format(-Math.round(minutes / 60), 'hour')
    : rtf.format(-Math.round(minutes / 1440), 'day')
}

export default function GraphPanel(): React.JSX.Element {
  const repo = useActiveRepo()
  const repoId = repo?.id ?? null
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const status = useAppStore((s) => (repoId ? s.graphifyByRepo[repoId] : undefined))
  const log = useAppStore((s) => (repoId ? s.graphifyLogByRepo[repoId] : undefined)) ?? []
  const refreshGraphify = useAppStore((s) => s.refreshGraphify)
  const buildGraphify = useAppStore((s) => s.buildGraphify)
  const updateGraphify = useAppStore((s) => s.updateGraphify)
  const cancelGraphify = useAppStore((s) => s.cancelGraphify)
  const [deep, setDeep] = useState(false)

  useEffect(() => {
    if (repoId) {
      void refreshGraphify(repoId).catch(() => {})
    }
  }, [repoId, refreshGraphify])

  if (!repoId) {
    return <div className="p-3 text-xs text-muted-foreground">—</div>
  }
  const attempt = (action: () => Promise<unknown>): void => {
    void action().catch((error) =>
      toast.error(error instanceof Error ? error.message : String(error))
    )
  }
  const openViewer = (): void =>
    attempt(async () => {
      const { url } = await callRuntimeRpc<{ url: string }>(
        { kind: 'local' },
        'graphify.openViewer',
        {
          repoId
        }
      )
      // openHtmlFileInBrowser takes a path; file URL -> path.
      openHtmlFileInBrowser(decodeURIComponent(new URL(url).pathname), activeWorktreeId ?? '', true)
    })

  const running = status?.running ?? null
  const built = status?.state === 'built'
  let summary = translate('auto.components.right.sidebar.GraphPanel.none', 'No graph yet')
  if (running) {
    summary =
      running === 'build'
        ? translate('auto.components.right.sidebar.GraphPanel.building', 'Building…')
        : translate('auto.components.right.sidebar.GraphPanel.updating', 'Updating…')
  } else if (built && status?.builtAt) {
    summary = translate(
      'auto.components.right.sidebar.GraphPanel.built',
      'Built {{when}} · {{nodes}} nodes · {{edges}} edges · semantic {{semantic}}',
      {
        when: relativeTime(status.builtAt),
        nodes: status.nodeCount,
        edges: status.edgeCount,
        semantic: status.semantic
          ? translate('auto.components.right.sidebar.GraphPanel.yes', 'yes')
          : translate('auto.components.right.sidebar.GraphPanel.no', 'no')
      }
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 scrollbar-sleek overflow-y-auto p-3">
      <p className="text-sm text-foreground">{summary}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!!running}
          onClick={() => attempt(() => buildGraphify(repoId, deep))}
        >
          {translate('auto.components.right.sidebar.GraphPanel.build', 'Build')}
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={deep} onCheckedChange={(v) => setDeep(v === true)} />
          {translate('auto.components.right.sidebar.GraphPanel.deep', 'Deep')}
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!built || !!running}
          onClick={() => attempt(() => updateGraphify(repoId))}
        >
          {translate('auto.components.right.sidebar.GraphPanel.update', 'Update')}
        </Button>
        {running ? (
          <Button size="sm" variant="outline" onClick={() => attempt(() => cancelGraphify(repoId))}>
            {translate('auto.components.right.sidebar.GraphPanel.cancel', 'Cancel')}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" disabled={!built} onClick={openViewer}>
          {translate('auto.components.right.sidebar.GraphPanel.openViewer', 'Open viewer')}
        </Button>
      </div>
      {status?.error ? (
        <p className="text-xs text-destructive">
          {status.error}{' '}
          {translate(
            'auto.components.right.sidebar.GraphPanel.installHint',
            'Graph builds need graphify, installed through uv (https://docs.astral.sh/uv/).'
          )}
        </p>
      ) : null}
      {log.length > 0 ? (
        <pre className="scrollbar-sleek max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
          {log.slice(-20).join('\n')}
        </pre>
      ) : null}
    </div>
  )
}
