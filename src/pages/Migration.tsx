import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Input } from '../components/Input'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Tabs } from '../components/Tabs'
import { EmptyState } from '../components/EmptyState'
import { uid } from '../lib/uid'
import {
  Plus,
  Settings2,
  Search,
  RefreshCw,
  Boxes,
  Database,
  Globe,
  ListChecks,
  Download,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40'

interface Package {
  id: number
  name: string
  filename: string
  domain: string
  site_path: string
  php_version: string
  db_kind: string
  db_name: string
  size: number
  created_at: number
}

interface Manifest {
  name: string
  domain: string
  site_path: string
  php_version: string
  db_kind: string
  db_name: string
  created_at: number
}

interface Settings {
  migration_dir: string
  mysqldump: string
  pgdump: string
  mysql_cli: string
  psql_cli: string
}

type TaskKind = 'export' | 'import'
type TaskStatus = 'pending' | 'running' | 'success' | 'failed'

interface Task {
  id: string
  kind: TaskKind
  status: TaskStatus
  progress: number
  message: string
  started_at: number
  finished_at: number
  // 导出成功后后端可回产物文件名,用于完成提示中的下载入口(可选,后端按需返回)。
  filename?: string
}

const kindLabel: Record<TaskKind, string> = { export: '导出', import: '导入' }

const taskStatusMeta: Record<
  TaskStatus,
  { label: string; badge: 'online' | 'warn' | 'crit' | 'neutral' }
> = {
  pending: { label: '排队中', badge: 'neutral' },
  running: { label: '进行中', badge: 'warn' },
  success: { label: '成功', badge: 'online' },
  failed: { label: '失败', badge: 'crit' },
}

function isTerminal(s: TaskStatus): boolean {
  return s === 'success' || s === 'failed'
}

interface ExportForm {
  name: string
  site_path: string
  domain: string
  php_version: string
  db_kind: string
  db_name: string
}

interface ImportForm {
  package_id: string
  site_dest: string
  import_db: boolean
  db_name: string
}

const emptyExport: ExportForm = {
  name: '',
  site_path: '',
  domain: '',
  php_version: '',
  db_kind: '',
  db_name: '',
}

const emptyImport: ImportForm = { package_id: '', site_dest: '', import_db: false, db_name: '' }

const dbLabel: Record<string, string> = { mysql: 'MySQL', postgres: 'PostgreSQL' }

type Tab = 'packages' | 'tasks'

// 类别切换对齐 aaPanel 顶部 tab;新建/导入/设置是工具栏动作,不进 tab。
const TABS: { key: Tab; label: string }[] = [
  { key: 'packages', label: '迁移包' },
  { key: 'tasks', label: '迁移任务' },
]

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

function fmtTime(unixSec: number): string {
  if (!unixSec) return '—'
  const d = new Date(unixSec * 1000)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 一键迁移:迁移包紧凑表 + 导出/导入(危险)/详情/设置弹窗,全部需要 admin。 */
export default function Migration() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [tab, setTab] = useState<Tab>('packages')
  const [packages, setPackages] = useState<Package[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [query, setQuery] = useState('')

  // 正在轮询的任务:提交导出/导入后置入,轮询 GET /tasks/{id} 直到 success/failed。
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detail, setDetail] = useState<Package | null>(null)
  const [preselect, setPreselect] = useState<string>('')

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [p, t, s] = await Promise.all([
        apiFetch<Package[]>('/api/m/migration/packages'),
        apiFetch<Task[]>('/api/m/migration/tasks'),
        apiFetch<Settings>('/api/m/migration/settings'),
      ])
      setPackages(p ?? [])
      setTasks(t ?? [])
      setSettings(s)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void load()
    else setLoading(false)
  }, [isAdmin, load])

  // activeTask 轮询:仅在有未完成任务时跑;setTimeout 自循环,卸载/任务终止时清理,
  // 不泄漏定时器。终止后回填任务列表 + 导出成功时刷新迁移包。
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    const id = activeTask && !isTerminal(activeTask.status) ? activeTask.id : null
    if (!id) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const t = await apiFetch<Task>(`/api/m/migration/tasks/${id}`)
        if (cancelled) return
        setActiveTask(t)
        setTasks((prev) => {
          const next = prev.filter((x) => x.id !== t.id)
          return [t, ...next]
        })
        if (isTerminal(t.status)) {
          if (t.status === 'success' && t.kind === 'export') void loadRef.current()
          return
        }
        timer = setTimeout(() => void tick(), 1500)
      } catch {
        // 轮询单次失败不打断:稍后重试,避免瞬时网络抖动终止整个进度跟踪。
        if (!cancelled) timer = setTimeout(() => void tick(), 1500)
      }
    }

    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [activeTask])

  const beginTask = useCallback((task: Task) => {
    setActiveTask(task)
    setTasks((prev) => [task, ...prev.filter((x) => x.id !== task.id)])
  }, [])

  // download 经鉴权 fetch 拉附件(apiFetch 走 JSON 解析,不适用于二进制流)。
  async function download(pkg: Package) {
    setFeedback(null)
    try {
      const t = tokenStore.get()
      const res = await fetch(`/api/m/migration/packages/${pkg.id}/download`, {
        headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pkg.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function remove(pkg: Package) {
    if (!window.confirm(`确认删除迁移包「${pkg.name}」?此操作不可恢复。`)) return
    setFeedback(null)
    try {
      await apiFetch(`/api/m/migration/packages/${pkg.id}`, { method: 'DELETE' })
      setPackages((prev) => prev.filter((p) => p.id !== pkg.id))
      setFeedback({ kind: 'ok', text: '迁移包已删除' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  function importFrom(pkg: Package) {
    setDetail(null)
    setPreselect(String(pkg.id))
    setImporting(true)
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return packages
    return packages.filter(
      (p) => p.name.toLowerCase().includes(q) || p.filename.toLowerCase().includes(q),
    )
  }, [packages, query])

  const columns: Column<Package>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '迁移包',
        cell: (p) => (
          <button
            type="button"
            onClick={() => setDetail(p)}
            className="inline-flex items-center gap-2 rounded-sm font-medium text-text outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <Boxes size={15} className="shrink-0 text-warn" />
            <span className="truncate">{p.name}</span>
          </button>
        ),
      },
      {
        key: 'source',
        header: '源域名',
        cell: (p) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {p.domain || p.site_path || '—'}
          </span>
        ),
      },
      {
        key: 'content',
        header: '内容',
        width: '160px',
        cell: (p) => (
          <span className="inline-flex flex-wrap items-center gap-1">
            {p.php_version && <Badge status="neutral">PHP {p.php_version}</Badge>}
            {p.db_kind ? (
              <Badge status="online">{dbLabel[p.db_kind] ?? p.db_kind}</Badge>
            ) : (
              <Badge status="neutral">仅站点</Badge>
            )}
          </span>
        ),
      },
      {
        key: 'size',
        header: '大小',
        width: '92px',
        cell: (p) => <span className="text-xs text-muted">{fmtBytes(p.size)}</span>,
      },
      {
        key: 'created',
        header: '导出时间',
        width: '150px',
        cell: (p) => <span className="text-xs text-muted">{fmtTime(p.created_at)}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '190px',
        align: 'right',
        cell: (p) => (
          <ActionLinks>
            <ActionLink onClick={() => setDetail(p)}>详情</ActionLink>
            <ActionLink onClick={() => void download(p)}>下载</ActionLink>
            <ActionLink onClick={() => importFrom(p)}>迁移</ActionLink>
            <ActionLink danger aria-label="删除迁移包" onClick={() => void remove(p)}>
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [],
  )

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-(--radius-card) border border-border bg-surface px-4 py-6 text-sm text-muted">
          一键迁移需要 admin 角色。
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="md" onClick={() => setExporting(true)}>
            <Plus size={15} />
            新建迁移包
          </Button>
          <Button variant="danger" size="md" onClick={() => setImporting(true)}>
            <Database size={15} />
            导入还原
          </Button>
          <Button variant="ghost" size="md" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} />
            设置
          </Button>
          <Button variant="ghost" size="md" aria-label="刷新" onClick={() => void load()}>
            <RefreshCw size={15} />
            刷新
          </Button>
        </div>
        {tab === 'packages' && (
          <div className="relative w-56">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索迁移包名或文件名"
              spellCheck={false}
              className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            />
          </div>
        )}
      </div>

      {feedback && (
        <p
          className={`rounded-(--radius-card) border px-3 py-2 text-sm ${
            feedback.kind === 'ok'
              ? 'border-online/40 bg-online/10 text-online'
              : 'border-crit/40 bg-crit/10 text-crit'
          }`}
        >
          {feedback.text}
        </p>
      )}

      {loadErr && packages.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      {activeTask && <ActiveTaskPanel task={activeTask} onClose={() => setActiveTask(null)} />}

      {tab === 'packages' &&
        (loading ? (
          <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
        ) : (
          <Table
            columns={columns}
            rows={visible}
            rowKey={(p) => p.id}
            emptyText={
              <EmptyState
                icon={<Boxes />}
                title={packages.length === 0 ? '还没有迁移包' : '没有匹配的迁移包'}
                hint={
                  packages.length === 0
                    ? '点击「新建迁移包」打包一个站点。'
                    : '换个关键词试试。'
                }
              />
            }
          />
        ))}

      {tab === 'tasks' && <TasksSection tasks={tasks} loading={loading} />}

      {exporting && (
        <ExportModal
          onClose={() => setExporting(false)}
          onStarted={(task) => {
            beginTask(task)
            setFeedback(null)
            setExporting(false)
          }}
        />
      )}
      {importing && (
        <ImportModal
          packages={packages}
          initialPackageId={preselect}
          onClose={() => {
            setImporting(false)
            setPreselect('')
          }}
          onStarted={(task) => {
            beginTask(task)
            setFeedback(null)
            setImporting(false)
            setPreselect('')
          }}
        />
      )}
      {settingsOpen && settings && (
        <SettingsModal
          initial={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setSettings(s)
            setFeedback({ kind: 'ok', text: '设置已保存' })
            setSettingsOpen(false)
          }}
        />
      )}
      {detail && <DetailModal pkg={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

/** ActiveTaskPanel 当前迁移进度:进度条 + 状态徽标,完成(success/failed)给出对应提示。 */
function ActiveTaskPanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const meta = taskStatusMeta[task.status]
  const done = isTerminal(task.status)
  const pct = Math.max(0, Math.min(100, Math.round(task.progress)))
  const barColor =
    task.status === 'failed' ? 'bg-crit' : task.status === 'success' ? 'bg-online' : 'bg-brand'

  return (
    <section className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {done ? (
            task.status === 'success' ? (
              <CheckCircle2 size={16} className="text-online" />
            ) : (
              <XCircle size={16} className="text-crit" />
            )
          ) : (
            <Spinner size={16} />
          )}
          <span className="text-sm font-medium text-text">{kindLabel[task.kind]}任务</span>
          <Badge status={meta.badge}>{meta.label}</Badge>
        </div>
        {done && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            收起
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-10 text-right font-[family-name:var(--font-mono)] text-xs text-muted">
          {pct}%
        </span>
      </div>

      {task.status === 'success' && (
        <p className="flex items-center gap-2 text-sm text-online">
          <Download size={15} className="shrink-0" />
          {task.kind === 'export'
            ? `导出完成${task.filename ? `:${task.filename}` : ''},可在下方迁移包列表下载。`
            : '导入完成,目标站点已还原。'}
        </p>
      )}
      {task.status === 'failed' && (
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {task.message || `${kindLabel[task.kind]}失败`}
        </p>
      )}
      {!done && task.message && <p className="text-xs text-muted">{task.message}</p>}
    </section>
  )
}

/** TasksSection 迁移任务表:类型/状态/进度/时间/消息,来自 GET /tasks,空态优雅。 */
function TasksSection({ tasks, loading }: { tasks: Task[]; loading: boolean }) {
  const columns: Column<Task>[] = useMemo(
    () => [
      {
        key: 'kind',
        header: '类型',
        width: '88px',
        cell: (t) => (
          <span className="inline-flex items-center gap-2 text-sm text-text">
            {t.kind === 'export' ? (
              <Boxes size={15} className="shrink-0 text-warn" />
            ) : (
              <Database size={15} className="shrink-0 text-brand" />
            )}
            {kindLabel[t.kind]}
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '92px',
        cell: (t) => {
          const m = taskStatusMeta[t.status]
          return <Badge status={m.badge}>{m.label}</Badge>
        },
      },
      {
        key: 'progress',
        header: '进度',
        width: '140px',
        cell: (t) => {
          const pct = Math.max(0, Math.min(100, Math.round(t.progress)))
          return (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full ${
                    t.status === 'failed' ? 'bg-crit' : t.status === 'success' ? 'bg-online' : 'bg-brand'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-[family-name:var(--font-mono)] text-xs text-muted">{pct}%</span>
            </div>
          )
        },
      },
      {
        key: 'time',
        header: '时间',
        width: '150px',
        cell: (t) => (
          <span className="text-xs text-muted">{fmtTime(t.finished_at || t.started_at)}</span>
        ),
      },
      {
        key: 'message',
        header: '消息',
        cell: (t) => (
          <span
            className={`truncate text-xs ${t.status === 'failed' ? 'text-crit' : 'text-muted'}`}
          >
            {t.message || '—'}
          </span>
        ),
      },
    ],
    [],
  )

  if (loading) {
    return <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
  }
  return (
    <Table
      columns={columns}
      rows={tasks}
      rowKey={(t) => t.id || uid()}
      emptyText={
        <EmptyState
          icon={<ListChecks />}
          title="还没有迁移任务"
          hint="导出或导入后,任务进度会显示在这里。"
        />
      }
    />
  )
}

function newTask(id: string, kind: TaskKind): Task {
  return {
    id,
    kind,
    status: 'pending',
    progress: 0,
    message: '',
    started_at: Math.floor(Date.now() / 1000),
    finished_at: 0,
  }
}

/** ExportModal 新建迁移包:固定尺寸表单,POST /export 返回 202 {task_id},交父组件轮询。 */
function ExportModal({
  onClose,
  onStarted,
}: {
  onClose: () => void
  onStarted: (task: Task) => void
}) {
  const [form, setForm] = useState<ExportForm>(emptyExport)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function set<K extends keyof ExportForm>(key: K, value: ExportForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const canSubmit =
    !busy &&
    form.site_path.trim().length > 0 &&
    (!form.db_kind || form.db_name.trim().length > 0)

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const res = await apiFetch<{ task_id: string }>('/api/m/migration/export', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          site_path: form.site_path.trim(),
          domain: form.domain.trim(),
          php_version: form.php_version.trim(),
          db_kind: form.db_kind,
          db_name: form.db_kind ? form.db_name.trim() : '',
        }),
      })
      onStarted(newTask(res.task_id, 'export'))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="新建迁移包" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="迁移包名(可选)"
            placeholder="留空用域名/时间戳"
            value={form.name}
            autoFocus
            onChange={(e) => set('name', e.target.value)}
          />
          <Input
            label="域名(元信息,可选)"
            placeholder="例如 example.com"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={form.domain}
            onChange={(e) => set('domain', e.target.value)}
          />
        </div>
        <Input
          label="站点目录绝对路径"
          placeholder="/www/wwwroot/example.com"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          value={form.site_path}
          onChange={(e) => set('site_path', e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="PHP 版本(可选)"
            placeholder="如 8.2"
            value={form.php_version}
            onChange={(e) => set('php_version', e.target.value)}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">数据库类型</span>
            <select
              className={fieldClass}
              value={form.db_kind}
              onChange={(e) => set('db_kind', e.target.value)}
            >
              <option value="">不含数据库</option>
              <option value="mysql">MySQL</option>
              <option value="postgres">PostgreSQL</option>
            </select>
          </label>
          <Input
            label="数据库名"
            placeholder={form.db_kind ? '必填' : '选类型后填'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={form.db_name}
            disabled={!form.db_kind}
            onChange={(e) => set('db_name', e.target.value)}
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
            导出
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** ImportModal 导入还原:危险操作,需 admin + X-Confirm-Danger 头 + 二次确认。 */
function ImportModal({
  packages,
  initialPackageId,
  onClose,
  onStarted,
}: {
  packages: Package[]
  initialPackageId: string
  onClose: () => void
  onStarted: (task: Task) => void
}) {
  const [form, setForm] = useState<ImportForm>({ ...emptyImport, package_id: initialPackageId })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function set<K extends keyof ImportForm>(key: K, value: ImportForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const canSubmit = !busy && form.package_id !== '' && form.site_dest.trim().length > 0

  async function submit() {
    if (!canSubmit) return
    if (
      !window.confirm(
        '导入会覆盖目标站点目录' +
          (form.import_db ? '及数据库' : '') +
          ',此操作危险且不可恢复。确认继续?',
      )
    )
      return
    setBusy(true)
    setErr(null)
    try {
      const res = await apiFetch<{ task_id: string }>('/api/m/migration/import', {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({
          package_id: Number(form.package_id),
          site_dest: form.site_dest.trim(),
          import_db: form.import_db,
          db_name: form.db_name.trim(),
        }),
      })
      onStarted(newTask(res.task_id, 'import'))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="导入还原(危险)" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-xs text-crit">
          导入会覆盖目标站点目录,勾选数据库时同时覆盖目标库,操作不可恢复。
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">迁移包</span>
          <select
            className={fieldClass}
            value={form.package_id}
            onChange={(e) => set('package_id', e.target.value)}
          >
            <option value="">选择迁移包</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.filename}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="站点还原目标根目录"
          placeholder="/www/wwwroot/restored"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          value={form.site_dest}
          onChange={(e) => set('site_dest', e.target.value)}
        />
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-brand)]"
            checked={form.import_db}
            onChange={(e) => set('import_db', e.target.checked)}
          />
          <span className="text-sm text-muted">同时导入包内数据库(覆盖目标库)</span>
        </label>
        {form.import_db && (
          <Input
            label="目标数据库名(留空用包内元信息)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={form.db_name}
            onChange={(e) => set('db_name', e.target.value)}
          />
        )}

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="danger" onClick={() => void submit()} disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            导入
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** SettingsModal 迁移设置:暂存目录 + 各 dump/CLI 二进制路径。 */
function SettingsModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Settings
  onClose: () => void
  onSaved: (s: Settings) => void
}) {
  const [form, setForm] = useState<Settings>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      const res = await apiFetch<Settings>('/api/m/migration/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      onSaved(res)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const fields: [keyof Settings, string][] = [
    ['migration_dir', '迁移包暂存目录'],
    ['mysqldump', 'mysqldump 路径'],
    ['pgdump', 'pg_dump 路径'],
    ['mysql_cli', 'mysql 客户端路径'],
    ['psql_cli', 'psql 客户端路径'],
  ]

  return (
    <Modal title="迁移设置" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(([key, label]) => (
            <Input
              key={key}
              label={label}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          ))}
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
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Spinner size={14} />}
            保存设置
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** DetailModal 迁移包详情:优先拉包内 manifest,失败回退列表行元信息。 */
function DetailModal({ pkg, onClose }: { pkg: Package; onClose: () => void }) {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const m = await apiFetch<Manifest>(`/api/m/migration/packages/${pkg.id}/manifest`)
        if (alive) setManifest(m)
      } catch {
        // manifest 不可用时回退展示列表元信息。
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [pkg.id])

  const src = manifest ?? pkg
  const rows: [string, string][] = [
    ['迁移包名', src.name || '—'],
    ['文件名', pkg.filename],
    ['源域名', src.domain || '—'],
    ['源站点目录', src.site_path || '—'],
    ['PHP 版本', src.php_version || '—'],
    ['数据库', src.db_kind ? `${dbLabel[src.db_kind] ?? src.db_kind} / ${src.db_name || '—'}` : '无'],
    ['大小', fmtBytes(pkg.size)],
    ['导出时间', fmtTime(src.created_at || pkg.created_at)],
  ]

  return (
    <Modal title="迁移包详情" size="md" onClose={onClose}>
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner size={24} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-muted" />
            <span className="truncate text-sm font-medium text-text">{src.name || pkg.filename}</span>
            {pkg.db_kind ? (
              <Badge status="online">{dbLabel[pkg.db_kind] ?? pkg.db_kind}</Badge>
            ) : (
              <Badge status="neutral">仅站点</Badge>
            )}
          </div>
          <dl className="divide-y divide-border/60 rounded-(--radius-card) border border-border">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-start gap-4 px-3 py-2">
                <dt className="w-28 shrink-0 text-xs text-muted">{k}</dt>
                <dd className="min-w-0 flex-1 break-words font-[family-name:var(--font-mono)] text-xs text-text">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Modal>
  )
}
