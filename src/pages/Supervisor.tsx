import { useCallback, useEffect, useState } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

// 文本端点(status/logs)走原始 fetch:apiFetch 强制 JSON.parse,纯文本会抛错。
async function fetchText(path: string): Promise<string> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

interface Program {
  id: number
  name: string
  command: string
  directory: string
  auto_restart: boolean
  numprocs: number
  created_at: number
  updated_at: number
}

interface Settings {
  conf_dir: string
  log_dir: string
}

interface FormState {
  name: string
  command: string
  directory: string
  auto_restart: boolean
  numprocs: string
}

const emptyForm: FormState = { name: '', command: '', directory: '', auto_restart: true, numprocs: '1' }

function OutputModal({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <Card className="flex max-h-[80vh] w-full max-w-3xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-medium text-text">{title}</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>
        <pre className="max-h-[60vh] overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
          {text.trim() || '无输出'}
        </pre>
      </Card>
    </div>
  )
}

function SettingsCard({ isAdmin }: { isAdmin: boolean }) {
  const [form, setForm] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setForm(await apiFetch<Settings>('/api/m/supervisor/settings'))
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
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
    setFb(null)
    try {
      setForm(await apiFetch<Settings>('/api/m/supervisor/settings', { method: 'PUT', body: JSON.stringify(form) }))
      setFb({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  if (loading || !form) {
    return <Card className="flex h-32 items-center justify-center"><Spinner size={24} /></Card>
  }

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-text">设置</h3>
      <Input label="配置目录 conf.d" value={form.conf_dir} spellCheck={false}
        onChange={(e) => setForm({ ...form, conf_dir: e.target.value })} />
      <Input label="日志目录" value={form.log_dir} spellCheck={false}
        onChange={(e) => setForm({ ...form, log_dir: e.target.value })} />
      <div className="flex items-center gap-2">
        <Button onClick={() => void save()} disabled={!isAdmin || busy}>保存</Button>
        {busy && <Spinner size={16} />}
      </div>
      {!isAdmin && <p className="text-xs text-muted">设置需要 admin 角色。</p>}
      {fb && <p className={`text-sm ${fb.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{fb.text}</p>}
    </Card>
  )
}

/** Supervisor 进程守护:守护程序表、添加表单、启停/重启/删除、状态与日志查看、设置。 */
export default function Supervisor() {
  const { role } = useAuth()
  const isOperator = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'

  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [fb, setFb] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setPrograms(await apiFetch<Program[]>('/api/m/supervisor/programs'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const name = form.name.trim()
  const command = form.command.trim()
  const directory = form.directory.trim()
  const numprocs = Number(form.numprocs)
  const numprocsValid = Number.isInteger(numprocs) && numprocs >= 1 && numprocs <= 256
  const canSubmit = !!name && !!command && !!directory && numprocsValid && !busy && isOperator

  async function create() {
    if (!canSubmit) return
    setBusy(true)
    setFormErr(null)
    try {
      await apiFetch('/api/m/supervisor/programs', {
        method: 'POST',
        body: JSON.stringify({ name, command, directory, auto_restart: form.auto_restart, numprocs }),
      })
      setForm(emptyForm)
      await load()
    } catch (e) {
      setFormErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function action(p: Program, verb: 'start' | 'stop' | 'restart') {
    if (verb === 'stop' && !window.confirm(`确认停止守护程序「${p.name}」?`)) return
    setBusy(true)
    setFb(null)
    try {
      await apiFetch(`/api/m/supervisor/programs/${p.id}/${verb}`, {
        method: 'POST',
        headers: verb === 'stop' ? DANGER : undefined,
      })
      setFb({ kind: 'ok', text: `已对 ${p.name} 执行 ${verb}` })
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: Program) {
    if (!window.confirm(`确认删除守护程序「${p.name}」?将停止进程并移除配置。`)) return
    setBusy(true)
    setFb(null)
    try {
      await apiFetch(`/api/m/supervisor/programs/${p.id}`, { method: 'DELETE', headers: DANGER })
      setFb({ kind: 'ok', text: `${p.name} 已删除` })
      await load()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function show(p: Program, kind: 'status' | 'logs') {
    setFb(null)
    try {
      const path =
        kind === 'status'
          ? `/api/m/supervisor/programs/${p.id}/status`
          : `/api/m/supervisor/programs/${p.id}/logs?tail=200`
      setModal({ title: `${p.name} · ${kind}`, text: await fetchText(path) })
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">新增守护程序</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="名称" value={form.name} spellCheck={false}
            placeholder="字母数字 . _ -" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="工作目录" value={form.directory} spellCheck={false}
            placeholder="绝对路径" onChange={(e) => setForm((f) => ({ ...f, directory: e.target.value }))} />
        </div>
        <Input label="命令" value={form.command} spellCheck={false}
          className="font-[family-name:var(--font-mono)]"
          placeholder="例如 /usr/bin/myapp --flag"
          onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))} />
        <div className="flex flex-wrap items-end gap-4">
          <Input label="进程数" inputMode="numeric" className="w-32" value={form.numprocs}
            error={form.numprocs.length > 0 && !numprocsValid ? '需为 1–256' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, numprocs: e.target.value }))} />
          <label className="flex items-center gap-2 pb-2.5">
            <Switch checked={form.auto_restart}
              onChange={(next) => setForm((f) => ({ ...f, auto_restart: next }))}
              aria-label="自动重启" />
            <span className="text-sm text-muted">自动重启</span>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void create()} disabled={!canSubmit}>新增</Button>
          {busy && <Spinner size={16} />}
        </div>
        {!isOperator && <p className="text-xs text-muted">新增需要 operator 角色;删除需要 admin。</p>}
        {formErr && <p className="text-sm text-crit">{formErr}</p>}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">守护程序</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>刷新</Button>
        </div>
        {fb && <p className={`px-5 pb-2 text-sm ${fb.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{fb.text}</p>}
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Spinner size={24} /></div>
        ) : loadErr && programs.length === 0 ? (
          <p className="p-5 text-sm text-muted">{loadErr}</p>
        ) : programs.length === 0 ? (
          <p className="p-5 text-sm text-muted">暂无守护程序。</p>
        ) : (
          <div className="divide-y divide-border">
            {programs.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-text">{p.name}</span>
                  <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{p.command}</span>
                  <span className="text-xs text-muted">
                    {p.directory} · {p.numprocs} 进程 · 自动重启 {p.auto_restart ? '开' : '关'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => void show(p, 'status')}>状态</Button>
                  <Button size="sm" variant="ghost" onClick={() => void show(p, 'logs')}>日志</Button>
                  <Button size="sm" variant="ghost" onClick={() => void action(p, 'start')} disabled={!isOperator || busy}>启动</Button>
                  <Button size="sm" variant="ghost" onClick={() => void action(p, 'stop')} disabled={!isOperator || busy}>停止</Button>
                  <Button size="sm" variant="ghost" onClick={() => void action(p, 'restart')} disabled={!isOperator || busy}>重启</Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(p)} disabled={!isAdmin || busy}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SettingsCard isAdmin={isAdmin} />

      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
    </div>
  )
}
