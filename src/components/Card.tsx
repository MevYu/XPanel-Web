import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 开启后 hover 时微妙抬升:border 提亮 + 柔和阴影 + 上移 1px。 */
  hoverable?: boolean
}

/** Card 容器:surface 底 + hairline 边 + 顶边内高光 + 柔和阴影,可选 hover 抬升。 */
export function Card({ hoverable, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-(--radius-card) border border-border/40 bg-surface p-5 shadow-[var(--shadow-card),var(--inset-hl)] ${
        hoverable
          ? 'transition-[border-color,box-shadow,transform] duration-(--dur-base) ease-(--ease-out) hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-elevated),var(--inset-hl)]'
          : ''
      } ${className}`}
      {...rest}
    />
  )
}
