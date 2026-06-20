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
import { EmptyState } from '../components/EmptyState'
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
  user: string
  priority: number
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

// parsePid 从 supervisorctl status 输出提取首个 "pid N";无则空串。
function parsePid(text: string): string {
  return text.match(/pid (\d+)/)?.[1] ?? ''
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
  user: string
  priority: string
  auto_restart: boolean
  numprocs: string
}

const emptyForm: FormState = {
  name: '',
  command: '',
  directory: '',
  user: '',
  priority: '999',
  auto_restart: true,
  numprocs: '1',
}

// 用户名:空(随 supervisor 属主)或标准 unix 用户名。
const USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/

function OutputModal({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} size="lg">
      <pre className="h-full rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
        {text.trim() || '无输出'}
      </pre>
    </Modal>
  )
}

/** ProgramModal 程序表单:固定尺寸弹窗(名称/目录/命令/进程数/自动重启),按后端契约提交。
 *  mode='create' POST /programs;mode='edit' PUT /programs/{id}。两者 body 契约一致,均需 admin。 */
function ProgramModal({
  mode,
  program,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  program?: Program
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [form, setForm] = useState<FormState>(() =>
    program
      ? {
          name: program.name,
          command: program.command,
          directory: program.directory,
          user: program.user,
          priority: String(program.priority),
          auto_restart: program.auto_restart,
          numprocs: String(program.numprocs),
        }
      : emptyForm,
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const name = form.name.trim()
  const command = form.command.trim()
  const directory = form.directory.trim()
  const user = form.user.trim()
  const priority = Number(form.priority)
  const numprocs = Number(form.numprocs)
  const numprocsValid = Number.isInteger(numprocs) && numprocs >= 1 && numprocs <= 256
  const userValid = user === '' || USER_RE.test(user)
  const priorityValid = Number.isInteger(priority) && priority >= 0 && priority <= 9999
  const canSubmit = !!name && !!command && !!directory && numprocsValid && userValid && priorityValid && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const path = mode === 'edit' ? `/api/m/supervisor/programs/${program!.id}` : '/api/m/supervisor/programs'
      await apiFetch(path, {
        method: mode === 'edit' ? 'PUT' : 'POST',
        body: JSON.stringify({ name, command, directory, user, priority, auto_restart: form.auto_restart, numprocs }),
      })
      await onSaved()
      onClose()
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={mode === 'edit' ? '编辑程序' : '添加程序'} onClose={onClose} size="sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p className="text-xs text-muted">命令以 supervisor 属主(通常 root)执行,需 admin 角色。</p>
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
            label="运行用户(可选)"
            value={form.user}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-44 font-[family-name:var(--font-mono)]"
            placeholder="默认 supervisor 属主"
            error={form.user.length > 0 && !userValid ? '非法用户名' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
          />
          <Input
            label="优先级"
            inputMode="numeric"
            className="w-28"
            value={form.priority}
            error={form.priority.length > 0 && !priorityValid ? '0–9999' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
          />
        </div>
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
            {mode === 'edit' ? '保存' : '添加程序'}
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

/** ConfigModal 编辑程序原生配置文件:读 conf.d/{name}.conf,保存后端写回 + reread/update。仅 admin。 */
function ConfigModal({
  program,
  onClose,
  onSaved,
}: {
  program: Program
  onClose: () => void
  onSaved: () => void
}) {
  const [content, setContent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch<{ content: string }>(`/api/m/supervisor/programs/${program.id}/config`)
      .then((r) => alive && setContent(r.content))
      .catch((e) => alive && setErr(errorText(e)))
    return () => {
      alive = false
    }
  }, [program.id])

  async function save() {
    if (content === null || busy) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/api/m/supervisor/programs/${program.id}/config`, {
        method: 'PUT',
        headers: DANGER,
        body: JSON.stringify({ content }),
      })
      onSaved()
      onClose()
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={`${program.name} · 配置`} onClose={onClose} size="md">
      <div className="flex flex-col gap-3">
        {content === null && !err ? (
          <div className="flex h-80 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : (
          <textarea
            value={content ?? ''}
            spellCheck={false}
            onChange={(e) => setContent(e.target.value)}
            className="h-80 resize-none rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 py-2 font-[family-name:var(--font-mono)] text-[13px] leading-relaxed text-text outline-none focus:border-brand focus:bg-surface-2"
          />
        )}
        <p className="text-xs text-muted">保存后写入 conf.d 并执行 supervisorctl reread + update。</p>
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={busy || content === null}>
            {busy && <Spinner size={14} />}
            保存
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** ProxyModal 为守护程序建反向代理:复用「网站」模块创建 kind=proxy 站点(把外域转发到程序本地址),无需后端改动。 */
function ProxyModal({
  program,
  onClose,
  onDone,
}: {
  program: Program
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [domains, setDomains] = useState('')
  const [listen, setListen] = useState('80')
  const [upstream, setUpstream] = useState('http://127.0.0.1:')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const domainList = domains
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((d) => d.toLowerCase())
  const listenNum = Number(listen)
  const listenValid = Number.isInteger(listenNum) && listenNum >= 1 && listenNum <= 65535
  const upstreamValid = /^https?:\/\/.+/.test(upstream.trim())
  const canSubmit = domainList.length > 0 && listenValid && upstreamValid && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/sites/sites', {
        method: 'POST',
        body: JSON.stringify({ domains: domainList, kind: 'proxy', listen: listenNum, upstream: upstream.trim() }),
      })
      onDone(`已为 ${program.name} 创建反向代理站点`)
      onClose()
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={`${program.name} · 反向代理`} onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          在「网站」模块创建一个反向代理站点,把外部域名转发到该程序监听的本地地址。需启用网站模块。
        </p>
        <Input
          label="域名(空格或逗号分隔)"
          value={domains}
          spellCheck={false}
          autoFocus
          placeholder="如 app.example.com"
          onChange={(e) => setDomains(e.target.value)}
        />
        <div className="flex flex-wrap items-end gap-4">
          <Input
            label="监听端口"
            inputMode="numeric"
            className="w-28"
            value={listen}
            error={listen.length > 0 && !listenValid ? '1–65535' : undefined}
            onChange={(e) => setListen(e.target.value)}
          />
          <Input
            label="目标地址(程序监听的本地址)"
            className="min-w-[15rem] flex-1 font-[family-name:var(--font-mono)]"
            value={upstream}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="http://127.0.0.1:8080"
            onChange={(e) => setUpstream(e.target.value)}
          />
        </div>
        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            创建代理
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Supervisor 进程守护:aaPanel 紧凑表布局——程序表(状态徽章/操作文字链)+ 添加程序弹窗 + 状态/日志弹窗 + 设置弹窗。 */
export default function Supervisor() {
  const { role } = useAuth()
  const isOperator = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'

  const [programs, setPrograms] = useState<Program[]>([])
  const [states, setStates] = useState<Record<number, { run: RunState; pid: string }>>({})
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [configProg, setConfigProg] = useState<Program | null>(null)
  const [proxyProg, setProxyProg] = useState<Program | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // refreshStates 拉取每个程序的运行态用于徽章;list 端点不带运行态,这是后端薄处,失败逐个回退 unknown。
  const refreshStates = useCallback(async (list: Program[]) => {
    const entries = await Promise.all(
      list.map(async (p): Promise<[number, { run: RunState; pid: string }]> => {
        try {
          const text = await fetchText(`/api/m/supervisor/programs/${p.id}/status`)
          return [p.id, { run: parseRunState(text), pid: parsePid(text) }]
        } catch {
          return [p.id, { run: 'unknown', pid: '' }]
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
        // 状态徽章即启停开关:运行中→点停,其它→点启(对齐 aaPanel 的 Status 列)。
        cell: (p) => {
          const run = states[p.id]?.run ?? 'unknown'
          const b = RUN_BADGE[run]
          const canToggle = isOperator && !busy && run !== 'unknown'
          const willStop = run === 'running'
          return (
            <button
              type="button"
              disabled={!canToggle}
              title={canToggle ? (willStop ? '点击停止' : '点击启动') : undefined}
              onClick={() => void action(p, willStop ? 'stop' : 'start')}
              className="rounded-(--radius-sm) outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 enabled:cursor-pointer enabled:hover:opacity-80 disabled:cursor-default"
            >
              <Badge status={b.status}>{b.label}</Badge>
            </button>
          )
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
        header: '路径',
        cell: (p) => (
          <span className="block truncate font-[family-name:var(--font-mono)] text-xs text-muted" title={p.directory}>
            {p.directory}
          </span>
        ),
      },
      {
        key: 'user',
        header: '用户',
        width: '96px',
        cell: (p) => (
          <span className="block truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {p.user || '—'}
          </span>
        ),
      },
      {
        key: 'pid',
        header: 'PID',
        width: '88px',
        align: 'right',
        cell: (p) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted tabular-nums">
            {states[p.id]?.pid || '—'}
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
        key: 'priority',
        header: '优先级',
        width: '72px',
        align: 'right',
        cell: (p) => <span className="text-xs text-muted tabular-nums">{p.priority}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '296px',
        align: 'right',
        cell: (p) => (
          <ActionLinks>
            <ActionLink onClick={() => void show(p, 'logs')}>日志</ActionLink>
            <ActionLink disabled={!isOperator || busy} onClick={() => void action(p, 'restart')}>
              重启
            </ActionLink>
            <ActionLink
              disabled={!isAdmin || busy}
              aria-label="编辑程序"
              title={isAdmin ? '编辑程序' : '需要 admin 角色'}
              onClick={() => setEditing(p)}
            >
              编辑
            </ActionLink>
            <ActionLink
              disabled={!isAdmin || busy}
              aria-label="编辑配置文件"
              title={isAdmin ? '编辑配置文件' : '需要 admin 角色'}
              onClick={() => setConfigProg(p)}
            >
              配置
            </ActionLink>
            <ActionLink
              disabled={!isOperator || busy}
              aria-label="反向代理"
              title={isOperator ? '建反向代理(网站模块)' : '需要 operator 角色'}
              onClick={() => setProxyProg(p)}
            >
              代理
            </ActionLink>
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
            <EmptyState
              icon={<Boxes />}
              title="还没有守护程序"
              hint="点击「添加程序」托管你的第一个常驻进程。"
            />
          }
        />
      )}

      {!isOperator && (
        <p className="text-xs text-muted">启停需要 operator 角色;添加与删除需要 admin。</p>
      )}

      {creating && <ProgramModal mode="create" onClose={() => setCreating(false)} onSaved={load} />}
      {editing && (
        <ProgramModal mode="edit" program={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
      {settingsOpen && <SettingsModal isAdmin={isAdmin} onClose={() => setSettingsOpen(false)} />}
      {configProg && (
        <ConfigModal program={configProg} onClose={() => setConfigProg(null)} onSaved={load} />
      )}
      {proxyProg && (
        <ProxyModal
          program={proxyProg}
          onClose={() => setProxyProg(null)}
          onDone={(text) => setFb({ kind: 'ok', text })}
        />
      )}
      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
    </div>
  )
}
