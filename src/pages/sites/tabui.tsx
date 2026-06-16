import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { Switch } from '../../components/Switch'
import { errorText } from './shared'

/** TabSection 一个带标题/副标题的设置区块卡片。 */
export function TabSection({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-text">{title}</h3>
        {desc && <p className="text-xs text-muted">{desc}</p>}
      </div>
      {children}
    </section>
  )
}

/** Labeled 带 label 的纵向字段壳,供裸 select / textarea 复用。 */
export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

/** SwitchRow 开关 + 文案一行。 */
export function SwitchRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string
  desc?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-text">{label}</span>
        {desc && <span className="text-xs text-muted">{desc}</span>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  )
}

/** Feedback 行内错误/成功提示条。 */
export function Feedback({ msg }: { msg: { kind: 'ok' | 'err'; text: string } | null }) {
  if (!msg) return null
  return (
    <p
      className={`rounded-(--radius-card) border px-3 py-2 text-sm ${
        msg.kind === 'ok'
          ? 'border-online/40 bg-online/10 text-online'
          : 'border-crit/40 bg-crit/10 text-crit'
      }`}
    >
      {msg.text}
    </p>
  )
}

/** SaveBar 保存按钮 + 旋转 + 可选提示文案。 */
export function SaveBar({
  onSave,
  busy,
  disabled,
  hint,
  label = '保存',
}: {
  onSave: () => void
  busy: boolean
  disabled?: boolean
  hint?: string
  label?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={onSave} disabled={busy || disabled}>
        {busy && <Spinner size={14} />}
        {label}
      </Button>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

export function TabLoading() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Spinner size={22} />
    </div>
  )
}

/** useTabResource 拉单个子资源:GET 一次,暴露 data/loading/错误与本地 setData。 */
export function useTabResource<T>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setData(await apiFetch<T>(path))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, setData, loading, err, reload }
}
