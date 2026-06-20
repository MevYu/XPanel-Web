import type { ReactNode } from 'react'

/** EmptyState 空态:对标设计稿 .u-empty —— 居中大图标(faint)+ 标题 + 可选提示。 */
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode
  title: ReactNode
  hint?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      {icon && (
        <span className="text-faint [&_svg]:h-12 [&_svg]:w-12 [&_svg]:stroke-[1.2]" aria-hidden>
          {icon}
        </span>
      )}
      <span className="text-sm font-medium text-text">{title}</span>
      {hint && <span className="max-w-sm text-xs text-muted">{hint}</span>}
    </div>
  )
}
