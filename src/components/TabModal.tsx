import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ModalTab<K extends string> {
  key: K
  label: string
  Icon?: LucideIcon
}

interface TabModalProps<K extends string> {
  /** 标题栏主标题(如「网站设置」)。 */
  title: ReactNode
  /** 标题右侧补充(如站点名 / 类型 badge)。 */
  subtitle?: ReactNode
  tabs: ModalTab<K>[]
  active: K
  onTab: (key: K) => void
  onClose: () => void
  /** 右侧内容区,由调用方按 active 渲染。 */
  children: ReactNode
}

/** TabModal 左竖 tab 居中模态:视口固定宽高(880×680 上限)、标题栏、左竖 tab 列、右侧独立滚动内容区。切 tab 外框尺寸不变。窄屏 tab 降级横排。深色沿用现有弹窗 token。 */
export function TabModal<K extends string>({
  title,
  subtitle,
  tabs,
  active,
  onTab,
  onClose,
  children,
}: TabModalProps<K>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(86vh,680px)] max-h-full w-[min(92vw,880px)] flex-col overflow-hidden rounded-(--radius-card) border border-border/80 bg-bg shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]"
      >
        <header className="flex items-center gap-2 border-b border-border bg-surface px-5 py-3.5">
          <h2 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-text">
            {title}
          </h2>
          {subtitle && <div className="flex min-w-0 flex-wrap items-center gap-2">{subtitle}</div>}
          <button
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-(--radius-sm) text-muted transition hover:bg-surface-2 hover:text-text"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            aria-label="设置分类"
            className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border bg-surface p-2 sm:w-[180px] sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r"
          >
            {tabs.map(({ key, label, Icon }) => {
              const isActive = key === active
              return (
                <button
                  key={key}
                  onClick={() => onTab(key)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-(--radius-sm) px-3 py-2 text-[13px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 sm:w-full ${
                    isActive
                      ? 'bg-brand-soft text-brand'
                      : 'text-muted hover:bg-surface-2 hover:text-text'
                  }`}
                >
                  {Icon && <Icon size={15} className="shrink-0" />}
                  {label}
                </button>
              )
            })}
          </nav>

          <div className="min-w-0 flex-1 overflow-auto p-5">{children}</div>
        </div>
      </div>
    </div>
  )
}
