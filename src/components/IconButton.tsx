import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  'aria-label': string
}

/** IconButton 仅图标按钮:必须传 aria-label 保证可访问性。hover 提亮底 + 图标转亮。 */
export function IconButton({ icon, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      className={`inline-flex h-9 w-9 items-center justify-center rounded-(--radius-sm) text-muted transition-[background-color,color,transform] duration-(--dur-micro) ease-(--ease-out) outline-none hover:bg-surface-2 hover:text-text active:scale-95 focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      {icon}
    </button>
  )
}
