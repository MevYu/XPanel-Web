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
  target_kind: TargetKind
  target: string
  remote_id: string
}

const empty: Form = { target_kind: 'path', target: '', remote_id: '' }

/** RunBackupModal 立即备份弹窗:选类型 / 目标 / 存储位置,提交后台同步执行一次。 */
export function RunBackupModal({
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

  const canSubmit = form.target.trim().length > 0 && !busy

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/backup/run', {
        method: 'POST',
        body: JSON.stringify({
          target_kind: form.target_kind,
          target: form.target.trim(),
          remote_id: parseRemoteId(form.remote_id),
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
    <Modal title="新建备份" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">立即执行一次备份,完成后写入备份记录。</p>

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
          placeholder={form.target_kind === 'path' ? '/var/www/site' : 'mydb'}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          className="font-[family-name:var(--font-mono)]"
          value={form.target}
          onChange={(e) => set('target', e.target.value)}
        />

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
            立即备份
          </Button>
        </div>
      </div>
    </Modal>
  )
}
