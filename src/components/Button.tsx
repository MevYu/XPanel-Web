import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-brand text-bg hover:brightness-110 disabled:hover:brightness-100',
  ghost:
    'bg-transparent text-text border border-border hover:bg-surface-2 disabled:hover:bg-transparent',
  danger: 'bg-crit text-bg hover:brightness-110 disabled:hover:brightness-100',
}

const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
}

/** Button 主操作按钮:primary/ghost/danger 三态,sm/md 尺寸,带 focus-visible 环。 */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-(--radius-card) font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...rest}
    />
  )
}
