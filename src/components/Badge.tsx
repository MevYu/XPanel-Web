import type { ReactNode } from 'react'

type BadgeStatus = 'online' | 'warn' | 'crit' | 'neutral'

interface BadgeProps {
  status: BadgeStatus
  children: ReactNode
}

// 状态色驱动徽标三处:soft 底、同色边、圆点 + 文字。neutral 走中性 surface。
const styleFor: Record<BadgeStatus, { wrap: string; dot: string; text: string }> = {
  online: { wrap: 'bg-online-soft border-online/25', dot: 'bg-online', text: 'text-online' },
  warn: { wrap: 'bg-warn-soft border-warn/25', dot: 'bg-warn', text: 'text-warn' },
  crit: { wrap: 'bg-crit-soft border-crit/25', dot: 'bg-crit', text: 'text-crit' },
  neutral: { wrap: 'bg-surface-2 border-border', dot: 'bg-muted', text: 'text-muted' },
}

/** Badge 状态徽标:状态色 soft 底 + 同色细边 + 圆点 + 文案,语义一致。 */
export function Badge({ status, children }: BadgeProps) {
  const s = styleFor[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.wrap}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      <span className={s.text}>{children}</span>
    </span>
  )
}
