import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variantClass: Record<Variant, string> = {
  primary:
    'bg-brand text-bg shadow-[var(--shadow-glow)] hover:bg-brand-bright hover:shadow-[0_10px_28px_-8px_rgba(110,139,255,0.6)] active:bg-brand-dim active:translate-y-px disabled:shadow-none disabled:hover:bg-brand',
  ghost:
    'bg-surface-2/60 text-text border border-border shadow-[var(--inset-hl)] hover:border-border-strong hover:bg-elevated active:translate-y-px disabled:hover:bg-surface-2/60 disabled:hover:border-border',
  danger:
    'bg-crit text-bg shadow-[0_8px_24px_-10px_rgba(229,72,77,0.5)] hover:brightness-110 active:brightness-95 active:translate-y-px disabled:shadow-none disabled:hover:brightness-100',
}

const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

/** Button 主操作按钮:primary/ghost/danger 三态,sm/md 尺寸,带 focus-visible 环与 active 下沉。 */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-(--radius-sm) font-medium transition-[background-color,box-shadow,transform,border-color,filter] duration-(--dur-micro) ease-(--ease-out) outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...rest}
    />
  )
}
