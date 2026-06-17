import { useState } from 'react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import {
  type Remote,
  type TargetKind,
  TARGET_KINDS,
  errorText,
  fieldClass,
  parseRemoteId,
} from './shared'

interface Form {
  name: string
  target_kind: TargetKind
  target: string
  remote_id: string
  frequency: string
  keep: string
}

const empty: Form = {
  name: '',
  target_kind: 'path',
  target: '',
  remote_id: '',
  frequency: 'daily',
  keep: '7',
}

/** JobModal 新建备份任务弹窗:任务名 / 类型 / 目标 / 存储 / 周期 / 保留份数。 */
export function JobModal({
  remotes,
  onClose,
  onDone,
}: {
  remotes: Remote[]
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState<Form>(empty)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const keepNum = Number(form.keep)
  const keepValid = Number.isInteger(keepNum) && keepNum >= 0
  const canSubmit =
    form.name.trim().length > 0 && form.target.trim().length > 0 && keepValid && !busy

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/backup/jobs', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          target_kind: form.target_kind,
          target: form.target.trim(),
          remote_id: parseRemoteId(form.remote_id),
          frequency: form.frequency.trim(),
          keep: keepNum,
        }),
      })
      onDone()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="新建备份任务" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">配置定时备份与保留策略,过期份数可在列表手动清理。</p>

        <Input
          label="任务名称"
          autoFocus
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">备份类型</span>
            <select
              value={form.target_kind}
              onChange={(e) => set('target_kind', e.target.value as TargetKind)}
              className={fieldClass}
            >
              {TARGET_KINDS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label={form.target_kind === 'path' ? '目录路径' : '数据库名'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-[family-name:var(--font-mono)]"
            value={form.target}
            onChange={(e) => set('target', e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">存储位置</span>
            <select
              value={form.remote_id}
              onChange={(e) => set('remote_id', e.target.value)}
              className={fieldClass}
            >
              <option value="">本地</option>
              {remotes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="执行周期"
            placeholder="daily / weekly"
            spellCheck={false}
            value={form.frequency}
            onChange={(e) => set('frequency', e.target.value)}
          />
          <Input
            label="保留份数(0 不清理)"
            inputMode="numeric"
            error={form.keep.length > 0 && !keepValid ? '需为 ≥0 整数' : undefined}
            value={form.keep}
            onChange={(e) => set('keep', e.target.value)}
          />
        </div>

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            创建任务
          </Button>
        </div>
      </div>
    </Modal>
  )
}
