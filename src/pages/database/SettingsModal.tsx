import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { type Settings, type SettingsResponse, errorText } from './shared'

/** SettingsModal 连接设置弹窗:MySQL / PostgreSQL / Redis 连接参数与备份目录。 */
export function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Settings | null>(null)
  const [passSet, setPassSet] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<SettingsResponse>('/api/m/database/settings')
      setForm(data.settings)
      setPassSet(data.passwords_set ?? [])
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!form) return
    setBusy(true)
    setFeedback(null)
    try {
      const data = await apiFetch<SettingsResponse>('/api/m/database/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      setForm(data.settings)
      setPassSet(data.passwords_set ?? [])
      setFeedback({ kind: 'ok', text: '设置已保存' })
      onSaved()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function num(v: string): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const passHint = (key: string) => (passSet.includes(key) ? '已设置,留空保留原值' : '未设置')

  return (
    <Modal title="连接设置" size="lg" onClose={onClose}>
      {loading || !form ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner size={24} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">MySQL / MariaDB</span>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="主机" value={form.mysql_host} spellCheck={false}
                onChange={(e) => setForm({ ...form, mysql_host: e.target.value })} />
              <Input label="端口" inputMode="numeric" value={String(form.mysql_port)}
                onChange={(e) => setForm({ ...form, mysql_port: num(e.target.value) })} />
              <Input label="Socket(可选)" value={form.mysql_socket} spellCheck={false}
                onChange={(e) => setForm({ ...form, mysql_socket: e.target.value })} />
              <Input label="用户" value={form.mysql_user} spellCheck={false}
                onChange={(e) => setForm({ ...form, mysql_user: e.target.value })} />
              <Input label={`密码(${passHint('mysql')})`} type="password" value={form.mysql_password}
                placeholder="••••••" onChange={(e) => setForm({ ...form, mysql_password: e.target.value })} />
              <Input label="数据目录" value={form.mysql_data_dir} spellCheck={false}
                onChange={(e) => setForm({ ...form, mysql_data_dir: e.target.value })} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">PostgreSQL</span>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="主机" value={form.pg_host} spellCheck={false}
                onChange={(e) => setForm({ ...form, pg_host: e.target.value })} />
              <Input label="端口" inputMode="numeric" value={String(form.pg_port)}
                onChange={(e) => setForm({ ...form, pg_port: num(e.target.value) })} />
              <Input label="用户" value={form.pg_user} spellCheck={false}
                onChange={(e) => setForm({ ...form, pg_user: e.target.value })} />
              <Input label={`密码(${passHint('pg')})`} type="password" value={form.pg_password}
                placeholder="••••••" onChange={(e) => setForm({ ...form, pg_password: e.target.value })} />
              <Input label="数据目录" value={form.pg_data_dir} spellCheck={false}
                onChange={(e) => setForm({ ...form, pg_data_dir: e.target.value })} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Redis</span>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="主机" value={form.redis_host} spellCheck={false}
                onChange={(e) => setForm({ ...form, redis_host: e.target.value })} />
              <Input label="端口" inputMode="numeric" value={String(form.redis_port)}
                onChange={(e) => setForm({ ...form, redis_port: num(e.target.value) })} />
              <Input label={`密码(${passHint('redis')})`} type="password" value={form.redis_password}
                placeholder="••••••" onChange={(e) => setForm({ ...form, redis_password: e.target.value })} />
            </div>
          </section>

          <Input label="备份目录" value={form.backup_dir} spellCheck={false}
            onChange={(e) => setForm({ ...form, backup_dir: e.target.value })} />

          {feedback && (
            <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
              {feedback.text}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              关闭
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy && <Spinner size={16} />}
              保存设置
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
