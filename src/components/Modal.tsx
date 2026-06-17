import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalSize = 'sm' | 'md' | 'lg'

/** 视口固定宽度,各档统一,弹窗不随内容伸缩。 */
const WIDTH: Record<ModalSize, string> = {
  sm: 'w-[min(92vw,480px)]',
  md: 'w-[min(92vw,640px)]',
  lg: 'w-[min(92vw,880px)]',
}

interface ModalProps {
  /** 标题栏文本;省略则不渲染标题栏(调用方自带头部)。 */
  title?: ReactNode
  onClose: () => void
  /** sm=480 / md=640 / lg=880,宽度固定。默认 md。 */
  size?: ModalSize
  children: ReactNode
}

/**
 * Modal 居中模态外壳:视口固定宽高(高 min(86vh,680px))、内容区内部滚动,
 * 切换内容外框尺寸不变;遮罩点击关闭 + ESC 关闭。深色沿用现有弹窗 token。
 */
export function Modal({ title, onClose, size = 'md', children }: ModalProps) {
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
        className={`flex h-[min(86vh,680px)] max-h-full ${WIDTH[size]} flex-col overflow-hidden rounded-(--radius-card) border border-border/80 bg-bg shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]`}
      >
        {title !== undefined && (
          <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-5 py-3.5">
            <h2 className="min-w-0 truncate font-[family-name:var(--font-display)] text-[15px] font-semibold text-text">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="ml-auto inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-sm) text-muted transition hover:bg-surface-2 hover:text-text"
            >
              <X size={16} />
            </button>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
