import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 开启后 hover 时微妙抬升:border 提亮 + 柔和阴影。 */
  hoverable?: boolean
}

/** Card 容器:surface 底 + border + radius-card,可选 hover 抬升。 */
export function Card({ hoverable, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-(--radius-card) border border-border bg-surface p-5 ${
        hoverable
          ? 'transition hover:border-surface-2 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]'
          : ''
      } ${className}`}
      {...rest}
    />
  )
}
