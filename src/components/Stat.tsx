import type { ReactNode } from 'react'

interface StatProps {
  /** 主读数,大号等宽数字。 */
  value: ReactNode
  /** 单位/指标标签,小写 muted。 */
  label: string
}

/** Stat 遥测读数:大号 mono 数字 + 小写 muted 标签。 */
export function Stat({ value, label }: StatProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-[family-name:var(--font-mono)] text-3xl font-medium tabular-nums tracking-tight text-text">
        {value}
      </span>
      <span className="text-xs lowercase tracking-wide text-muted">{label}</span>
    </div>
  )
}
