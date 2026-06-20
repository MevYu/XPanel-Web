import { useState } from 'react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Badge } from '../../components/Badge'
import { Spinner } from '../../components/Spinner'
import { Trash2 } from 'lucide-react'
import { type Remote, type Settings, DANGER, errorText } from './shared'

interface RemoteForm {
  name: string
  type: string
  bucket: string
  endpoint: string
  region: string
  access_key: string
  secret: string
}

const emptyRemote: RemoteForm = {
  name: '',
  type: 's3',
  bucket: '',
  endpoint: '',
  region: '',
  access_key: '',
  secret: '',
}

/**
 * TargetSettingsModal 备份目标设置弹窗:管理远端存储(rclone 后端)与本地备份目录 / dump 工具路径。
 * 远端 secret 只写不回显;远端删除带 X-Confirm-Danger。
 */
export function TargetSettingsModal({
  remotes,
  settings,
  onClose,
  onChanged,
}: {
  remotes: Remote[]
  settings: Settings | null
  onClose: () => void
  onChanged: () => void
}) {
  const [form, setForm] = useState<RemoteForm>(emptyRemote)
  const [local, setLocal] = useState<Settings | null>(settings)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  function setRemote<K extends keyof RemoteForm>(key: K, value: RemoteForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setOk(null)
  }

  function setSetting(key: keyof Settings, value: string) {
    setLocal((s) => (s ? { ...s, [key]: value } : s))
    setOk(null)
  }

  const canAdd = form.name.trim().length > 0 && form.type.trim().length > 0 && !busy

  async function addRemote() {
    if (!canAdd) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/backup/remotes', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type.trim(),
          bucket: form.bucket.trim(),
          endpoint: form.endpoint.trim(),
          region: form.region.trim(),
          access_key: form.access_key.trim(),
          secret: form.secret,
        }),
      })
      setForm(emptyRemote)
      setOk(`远端 ${form.name.trim()} 已添加`)
      onChanged()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteRemote(r: Remote) {
    if (!window.confirm(`确认删除远端 ${r.name}?`)) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/api/m/backup/remotes/${r.id}`, { method: 'DELETE', headers: DANGER })
      setOk(`远端 ${r.name} 已删除`)
      onChanged()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings() {
    if (!local) return
    setBusy(true)
    setErr(null)
    try {
      const saved = await apiFetch<Settings>('/api/m/backup/settings', {
        method: 'PUT',
        body: JSON.stringify(local),
      })
      setLocal(saved)
      setOk('设置已保存')
      onChanged()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="备份目标设置" size="lg" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-text">远端存储</h3>
          {remotes.length > 0 && (
            <div className="divide-y divide-border rounded-(--radius-card) border border-border">
              {remotes.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{r.name}</span>
                    <Badge status="neutral">{r.type}</Badge>
                    {r.secret_set && <Badge status="online">凭证已配置</Badge>}
                    <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                      {r.bucket}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteRemote(r)}
                    disabled={busy}
                    aria-label={`删除远端 ${r.name}`}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-sm) text-muted transition hover:bg-surface-2 hover:text-crit disabled:opacity-40"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="名称"
              placeholder="字母数字 _ -"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={form.name}
              onChange={(e) => setRemote('name', e.target.value)}
            />
            <Input
              label="类型 (rclone backend)"
              placeholder="s3 / oss / b2"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={form.type}
              onChange={(e) => setRemote('type', e.target.value)}
            />
            <Input
              label="桶 (bucket)"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={form.bucket}
              onChange={(e) => setRemote('bucket', e.target.value)}
            />
            <Input
              label="端点 (endpoint)"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={form.endpoint}
              onChange={(e) => setRemote('endpoint', e.target.value)}
            />
            <Input
              label="区域 (region)"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={form.region}
              onChange={(e) => setRemote('region', e.target.value)}
            />
            <Input
              label="Access key"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={form.access_key}
              onChange={(e) => setRemote('access_key', e.target.value)}
            />
            <Input
              label="Secret(只写)"
              type="password"
              autoComplete="off"
              placeholder="凭证密钥"
              value={form.secret}
              onChange={(e) => setRemote('secret', e.target.value)}
            />
          </div>
          <div>
            <Button size="sm" onClick={() => void addRemote()} disabled={!canAdd}>
              {busy && <Spinner size={14} />}
              添加远端
            </Button>
          </div>
        </section>

        {local && (
          <section className="flex flex-col gap-3 border-t border-border pt-5">
            <h3 className="text-sm font-medium text-text">本地路径</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="备份目录 (backup_dir)"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="font-[family-name:var(--font-mono)]"
                value={local.backup_dir}
                onChange={(e) => setSetting('backup_dir', e.target.value)}
              />
              <Input
                label="mysqldump 路径"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="font-[family-name:var(--font-mono)]"
                value={local.mysqldump}
                onChange={(e) => setSetting('mysqldump', e.target.value)}
              />
              <Input
                label="pg_dump 路径"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="font-[family-name:var(--font-mono)]"
                value={local.pgdump}
                onChange={(e) => setSetting('pgdump', e.target.value)}
              />
            </div>
            <div>
              <Button size="sm" onClick={() => void saveSettings()} disabled={busy}>
                {busy && <Spinner size={14} />}
                保存设置
              </Button>
            </div>
          </section>
        )}

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}
        {ok && <p className="text-sm text-online">{ok}</p>}
      </div>
    </Modal>
  )
}
