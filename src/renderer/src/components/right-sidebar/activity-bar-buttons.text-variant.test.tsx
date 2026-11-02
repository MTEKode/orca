import { renderToStaticMarkup } from 'react-dom/server'
import { GitBranch } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ActivityBarButton, type ActivityBarItem } from './activity-bar-buttons'
import { selectUncommittedChangeCount } from './source-control/uncommitted-change-count'

function makeItem(overrides: Partial<ActivityBarItem> = {}): ActivityBarItem {
  return {
    id: 'source-control',
    icon: GitBranch,
    title: 'Source Control',
    shortcut: '',
    ...overrides
  }
}

function render(variant: 'icon' | 'text', active: boolean, item = makeItem()): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <ActivityBarButton
        item={item}
        active={active}
        onClick={() => {}}
        layout="top"
        variant={variant}
      />
    </TooltipProvider>
  )
}

describe('ActivityBarButton text variant', () => {
  it('renders the active tab as an accent pill with the title as its label', () => {
    const html = render('text', true)
    expect(html).toContain('bg-accent text-accent-foreground')
    expect(html).toContain('rounded-md')
    expect(html).toContain('Source Control')
    expect(html).not.toContain('<svg')
  })

  it('renders inactive tabs muted', () => {
    expect(render('text', false)).toContain('text-muted-foreground hover:text-foreground')
  })

  it('appends the count suffix when the item has a badge count', () => {
    const state = {
      gitStatusByWorktree: {
        'wt-1': [
          { path: 'a.ts', status: 'modified', area: 'unstaged' },
          { path: 'b.ts', status: 'added', area: 'staged' },
          { path: 'c.ts', status: 'untracked', area: 'untracked' }
        ]
      }
    } as never
    const count = selectUncommittedChangeCount('wt-1')(state)
    expect(count).toBe(3)
    const html = render('text', true, makeItem({ badgeCount: count }))
    expect(html).toMatch(
      /Source Control<span class="ml-1 tabular-nums text-muted-foreground">3<\/span>/
    )
  })

  it('keeps icon markup for the default variant', () => {
    const html = render('icon', true)
    expect(html).toContain('<svg')
    expect(html).not.toContain('rounded-md')
  })
})
