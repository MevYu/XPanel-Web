import { useId, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

/** Input 带 label 的输入框,error 非空时进入 crit 错误态并显示提示。focus 时 brand 边 + 微辉光。type="password" 时右内侧出明文切换按钮。 */
export function Input({ label, error, className = '', id, type, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = error ? `${inputId}-error` : undefined
  const isPassword = type === 'password'
  const [reveal, setReveal] = useState(false)
  const effectiveType = isPassword && reveal ? 'text' : type
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={effectiveType}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={`h-10 w-full rounded-(--radius-sm) border bg-surface-2/70 px-3 text-sm text-text outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] transition-[border-color,box-shadow,background-color] duration-(--dur-micro) ease-(--ease-out) placeholder:text-faint hover:border-border-strong focus:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 ${
            isPassword ? 'pr-10' : ''
          } ${
            error
              ? 'border-crit focus:border-crit focus:shadow-[0_0_0_3px_var(--color-crit-soft),inset_0_1px_2px_rgba(0,0,0,0.25)]'
              : 'border-border focus:border-brand focus:shadow-[0_0_0_3px_var(--color-brand-soft),inset_0_1px_2px_rgba(0,0,0,0.25)]'
          }`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            aria-label={reveal ? '隐藏密码' : '显示密码'}
            onClick={() => setReveal((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-(--radius-sm) text-muted outline-none transition-colors duration-(--dur-micro) ease-(--ease-out) hover:text-text focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {error && (
        <span id={errorId} className="text-sm text-crit">
          {error}
        </span>
      )}
    </div>
  )
}
