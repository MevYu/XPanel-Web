import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

/** Input 带 label 的输入框,error 非空时进入 crit 错误态并显示提示。focus 时 brand 边 + 微辉光。 */
export function Input({ label, error, className = '', id, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = error ? `${inputId}-error` : undefined
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`h-10 rounded-(--radius-sm) border bg-surface-2/70 px-3 text-sm text-text outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] transition-[border-color,box-shadow,background-color] duration-(--dur-micro) ease-(--ease-out) placeholder:text-faint hover:border-border-strong focus:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 ${
          error
            ? 'border-crit focus:border-crit focus:shadow-[0_0_0_3px_var(--color-crit-soft),inset_0_1px_2px_rgba(0,0,0,0.25)]'
            : 'border-border focus:border-brand focus:shadow-[0_0_0_3px_var(--color-brand-soft),inset_0_1px_2px_rgba(0,0,0,0.25)]'
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
