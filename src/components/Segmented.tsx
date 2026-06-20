import type { ReactNode } from 'react'

export interface SegItem<K extends string> {
  key: K
  label: ReactNode
}

/** Segmented 分段控件:对标设计稿 .u-seg —— 内嵌容器,活动段 brand 实底,非活动 muted/hover 提亮。受控。 */
export function Segmented<K extends string>({
  items,
  active,
  onChange,
  className = '',
}: {
  items: SegItem<K>[]
  active: K
  onChange: (key: K) => void
  className?: string
}) {
  return (
    <div className={`inline-flex gap-0.5 rounded-(--radius-sm) border border-border bg-surface-2 p-0.5 ${className}`}>
      {items.map((it) => {
        const on = it.key === active
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`flex h-8 items-center justify-center rounded-[5px] px-3.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 ${
              on ? 'bg-brand text-bg' : 'text-muted hover:text-text'
            }`}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
