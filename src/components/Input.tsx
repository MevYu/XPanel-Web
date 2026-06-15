import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

/** Input 带 label 的输入框,error 非空时进入 crit 错误态并显示提示。 */
export function Input({ label, error, className = '', id, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = error ? `${inputId}-error` : undefined
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-muted"
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`h-10 rounded-(--radius-card) border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 ${
          error
            ? 'border-crit focus-visible:ring-crit/60'
            : 'border-border focus-visible:ring-brand/60'
        }`}
        {...rest}
      />
      {error && (
        <span id={errorId} className="text-sm text-crit">
          {error}
        </span>
      )}
    </div>
  )
}
