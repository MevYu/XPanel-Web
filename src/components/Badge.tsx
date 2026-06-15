import type { ReactNode } from 'react'

type BadgeStatus = 'online' | 'warn' | 'crit' | 'neutral'

interface BadgeProps {
  status: BadgeStatus
  children: ReactNode
}

const dotClass: Record<BadgeStatus, string> = {
  online: 'bg-online',
  warn: 'bg-warn',
  crit: 'bg-crit',
  neutral: 'bg-muted',
}

const textClass: Record<BadgeStatus, string> = {
  online: 'text-online',
  warn: 'text-warn',
  crit: 'text-crit',
  neutral: 'text-muted',
}

/** Badge 状态徽标:小圆点 + 文案,状态色取自 token。 */
export function Badge({ status, children }: BadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass[status]}`} aria-hidden />
      <span className={textClass[status]}>{children}</span>
    </span>
  )
}
