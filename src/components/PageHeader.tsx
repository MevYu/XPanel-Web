import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  right?: ReactNode
}

/** PageHeader 页面标题区:大标题 + 可选副标题,右侧可放操作槽,与各页 header 风格一致。 */
export function PageHeader({ title, subtitle, right }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
          {title}
        </h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}
