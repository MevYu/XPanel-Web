import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Modal } from '../components/Modal'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'
import { Badge } from '../components/Badge'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Plus, Settings2, RefreshCw, Boxes } from 'lucide-react'

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

// 运行态:从 supervisorctl status 文本解析出的语义状态,未知时为 'unknown'(不阻塞渲染)。
type RunState = 'running' | 'stopped' | 'fatal' | 'unknown'

// parseRunState 从 supervisorctl status 输出里提取首个已知状态 token。
function parseRunState(text: string): RunState {
  const t = text.toUpperCase()
  if (t.includes('RUNNING') || t.includes('STARTING')) return 'running'
  if (t.includes('FATAL') || t.includes('BACKOFF')) return 'fatal'
  if (t.includes('STOPPED') || t.includes('EXITED') || t.includes('STOPPING')) return 'stopped'
  return 'unknown'
}

const RUN_BADGE: Record<RunState, { status: 'online' | 'warn' | 'crit' | 'neutral'; label: string }> = {
  running: { status: 'online', label: '运行中' },
  stopped: { status: 'neutral', label: '已停止' },
  fatal: { status: 'crit', label: '异常' },
  unknown: { status: 'neutral', label: '未知' },
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
    <Modal title={title} onClose={onClose} size="lg">
      <pre className="h-full rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
        {text.trim() || '无输出'}
      </pre>
    </Modal>
  )
}

/** CreateModal 添加程序:固定尺寸弹窗表单(名称/目录/命令/进程数/自动重启),按后端契约提交。创建需 admin。 */
function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void | Promise<void>
}) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const name = form.name.trim()
  const command = form.command.trim()
  const directory = form.directory.trim()
  const numprocs = Number(form.numprocs)
  const numprocsValid = Number.isInteger(numprocs) && numprocs >= 1 && numprocs <= 256
  const canSubmit = !!name && !!command && !!directory && numprocsValid && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/supervisor/programs', {
        method: 'POST',
        body: JSON.stringify({ name, command, directory, auto_restart: form.auto_restart, numprocs }),
      })
      await onCreated()
      onClose()
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="添加程序" onClose={onClose} size="sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p className="text-xs text-muted">命令以 supervisor 属主(通常 root)执行,创建需 admin 角色。</p>
        <Input
          label="名称"
          value={form.name}
          spellCheck={false}
          autoFocus
          placeholder="字母数字 . _ -"
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Input
          label="工作目录"
          value={form.directory}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          placeholder="绝对路径"
          onChange={(e) => setForm((f) => ({ ...f, directory: e.target.value }))}
        />
        <Input
          label="启动命令"
          value={form.command}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          placeholder="例如 /usr/bin/myapp --flag"
          onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
        />
        <div className="flex flex-wrap items-end gap-4">
          <Input
            label="进程数"
            inputMode="numeric"
            className="w-32"
            value={form.numprocs}
            error={form.numprocs.length > 0 && !numprocsValid ? '需为 1–256' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, numprocs: e.target.value }))}
          />
          <label className="flex items-center gap-2 pb-2.5">
            <Switch
              checked={form.auto_restart}
              onChange={(next) => setForm((f) => ({ ...f, auto_restart: next }))}
              aria-label="自动重启"
            />
            <span className="text-sm text-muted">自动重启</span>
          </label>
        </div>
        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            添加程序
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** SettingsModal 设置:配置目录 conf.d 与日志目录,需 admin。固定尺寸弹窗。 */
function SettingsModal({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
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

  return (
    <Modal title="设置" onClose={onClose} size="sm">
      {loading || !form ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner size={24} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Input
            label="配置目录 conf.d"
            value={form.conf_dir}
            spellCheck={false}
            className="font-[family-name:var(--font-mono)]"
            onChange={(e) => setForm({ ...form, conf_dir: e.target.value })}
          />
          <Input
            label="日志目录"
            value={form.log_dir}
            spellCheck={false}
            className="font-[family-name:var(--font-mono)]"
            onChange={(e) => setForm({ ...form, log_dir: e.target.value })}
          />
          {!isAdmin && <p className="text-xs text-muted">设置需要 admin 角色。</p>}
          {fb && <p className={`text-sm ${fb.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{fb.text}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              关闭
            </Button>
            <Button onClick={() => void save()} disabled={!isAdmin || busy}>
              {busy && <Spinner size={14} />}
              保存
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Supervisor 进程守护:aaPanel 紧凑表布局——程序表(状态徽章/操作文字链)+ 添加程序弹窗 + 状态/日志弹窗 + 设置弹窗。 */
export default function Supervisor() {
  const { role } = useAuth()
  const isOperator = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'

  const [programs, setPrograms] = useState<Program[]>([])
  const [states, setStates] = useState<Record<number, RunState>>({})
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // refreshStates 拉取每个程序的运行态用于徽章;list 端点不带运行态,这是后端薄处,失败逐个回退 unknown。
  const refreshStates = useCallback(async (list: Program[]) => {
    const entries = await Promise.all(
      list.map(async (p): Promise<[number, RunState]> => {
        try {
          return [p.id, parseRunState(await fetchText(`/api/m/supervisor/programs/${p.id}/status`))]
        } catch {
          return [p.id, 'unknown']
        }
      }),
    )
    setStates(Object.fromEntries(entries))
  }, [])

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const list = await apiFetch<Program[]>('/api/m/supervisor/programs')
      setPrograms(list)
      void refreshStates(list)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [refreshStates])

  useEffect(() => {
    void load()
  }, [load])

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
      void refreshStates(programs)
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
      setModal({ title: `${p.name} · ${kind === 'status' ? '状态' : '日志'}`, text: await fetchText(path) })
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    }
  }

  const columns: Column<Program>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '程序名',
        cell: (p) => (
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <Boxes size={15} className="shrink-0 text-muted" />
            <span className="truncate">{p.name}</span>
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '92px',
        cell: (p) => {
          const b = RUN_BADGE[states[p.id] ?? 'unknown']
          return <Badge status={b.status}>{b.label}</Badge>
        },
      },
      {
        key: 'command',
        header: '命令',
        cell: (p) => (
          <span className="block truncate font-[family-name:var(--font-mono)] text-xs text-muted" title={p.command}>
            {p.command}
          </span>
        ),
      },
      {
        key: 'directory',
        header: '目录',
        cell: (p) => (
          <span className="block truncate font-[family-name:var(--font-mono)] text-xs text-muted" title={p.directory}>
            {p.directory}
          </span>
        ),
      },
      {
        key: 'auto_restart',
        header: '自动重启',
        width: '88px',
        cell: (p) => (
          <span className={`text-xs ${p.auto_restart ? 'text-online' : 'text-muted'}`}>
            {p.auto_restart ? '开' : '关'}
          </span>
        ),
      },
      {
        key: 'numprocs',
        header: '进程数',
        width: '72px',
        align: 'right',
        cell: (p) => <span className="text-xs text-muted">{p.numprocs}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '248px',
        align: 'right',
        cell: (p) => (
          <ActionLinks>
            <ActionLink disabled={!isOperator || busy} onClick={() => void action(p, 'start')}>
              启动
            </ActionLink>
            <ActionLink disabled={!isOperator || busy} onClick={() => void action(p, 'stop')}>
              停止
            </ActionLink>
            <ActionLink disabled={!isOperator || busy} onClick={() => void action(p, 'restart')}>
              重启
            </ActionLink>
            <ActionLink onClick={() => void show(p, 'logs')}>日志</ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin || busy}
              aria-label="删除程序"
              title={isAdmin ? '删除程序' : '需要 admin 角色'}
              onClick={() => void remove(p)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    // action/remove/show 闭包随 busy/role/states/programs 重算即可,逻辑稳定无需列出。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOperator, isAdmin, busy, states, programs],
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
            进程守护
          </h1>
          <p className="text-xs text-muted">
            {programs.length > 0 ? `共 ${programs.length} 个守护程序` : '用 supervisor 守护常驻进程,异常自动拉起'}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="md" disabled={!isAdmin} onClick={() => setCreating(true)}>
            <Plus size={15} />
            添加程序
          </Button>
          <Button variant="ghost" size="md" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} />
            设置
          </Button>
        </div>
        <Button variant="ghost" size="md" onClick={() => void load()} disabled={busy || loading}>
          <RefreshCw size={15} />
          刷新
        </Button>
      </div>

      {fb && <p className={`text-sm ${fb.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{fb.text}</p>}

      {loadErr && programs.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      {loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : (
        <Table
          columns={columns}
          rows={programs}
          rowKey={(p) => p.id}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">还没有守护程序</span>
              <span className="text-xs text-muted">点击「添加程序」托管你的第一个常驻进程。</span>
            </span>
          }
        />
      )}

      {!isOperator && (
        <p className="text-xs text-muted">启停需要 operator 角色;添加与删除需要 admin。</p>
      )}

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={load} />}
      {settingsOpen && <SettingsModal isAdmin={isAdmin} onClose={() => setSettingsOpen(false)} />}
      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
    </div>
  )
}
