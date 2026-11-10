import React from 'react'
import { Gauge, SignalHigh, SignalLow, SignalMedium, SignalZero, Zap } from 'lucide-react'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'

const EFFORT_ICONS: Record<string, typeof Gauge> = {
  none: SignalZero,
  minimal: SignalZero,
  low: SignalLow,
  medium: SignalMedium,
  high: SignalHigh,
  xhigh: Zap,
  max: Zap
}

/** Icon + label for a select option, so the closed trigger shows the icon too. */
function IconLabel({
  icon,
  iconKind,
  children
}: {
  icon: React.ReactNode
  iconKind: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        className="inline-flex size-4 shrink-0 items-center justify-center"
        data-icon={iconKind}
      >
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </span>
  )
}

export function NewChatHarnessLabel({
  agent,
  children
}: {
  agent: React.ComponentProps<typeof AgentIcon>['agent']
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <IconLabel iconKind="harness" icon={<AgentIcon agent={agent} size={14} />}>
      {children}
    </IconLabel>
  )
}

export function NewChatEffortLabel({
  value,
  children
}: {
  value: string
  children: React.ReactNode
}): React.JSX.Element {
  const Icon = EFFORT_ICONS[value.toLowerCase()] ?? Gauge
  return (
    <IconLabel iconKind={`effort-${value}`} icon={<Icon className="size-3.5" aria-hidden="true" />}>
      {children}
    </IconLabel>
  )
}
