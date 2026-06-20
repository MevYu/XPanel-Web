import type { ReactNode } from 'react'

export interface TabItem<K extends string> {
  key: K
  label: ReactNode
}

/**
 * Tabs 页面级标签条:对标设计稿 .u-tab —— 下划线高亮 + brand 辉光,非活动 muted、hover 提亮。
 * 受控:active 当前键,onChange 切换。底部 hairline 贯穿。
 */
export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  className = '',
}: {
  tabs: TabItem<K>[]
  active: K
  onChange: (key: K) => void
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1 border-b border-border ${className}`}>
      {tabs.map((t) => {
        const on = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`relative flex h-11 items-center gap-2 px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/60 ${
              on ? 'text-brand' : 'text-muted hover:text-text'
            }`}
          >
            {t.label}
            {on && (
              <span
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand shadow-[0_0_10px_var(--color-brand)]"
                aria-hidden
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
