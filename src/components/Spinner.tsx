interface SpinnerProps {
  size?: number
  className?: string
}

/** Spinner 细环旋转加载指示;reduced-motion 下静态(保留环形,不旋转)。 */
export function Spinner({ size = 16, className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="加载中"
      className={`inline-block animate-spin rounded-full border-2 border-surface-2 border-t-brand motion-reduce:animate-none ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
