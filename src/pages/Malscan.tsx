import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Stat } from '../components/Stat'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Input } from '../components/Input'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { ScanSearch, Play, SlidersHorizontal, ShieldAlert, Eye, RefreshCw } from 'lucide-react'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function fmtTime(unix: number | null): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

const DANGER = { 'X-Confirm-Danger': '1' }
type Feedback = { kind: 'ok' | 'err'; text: string } | null

interface Task {
  id: number
  root: string
  status: string
  files_scanned: number
  files_skipped: number
  flagged_count: number
  error: string
  started_by: number | null
  started_at: number
  finished_at: number | null
}

interface Hit {
  id: number
  task_id: number
  path: string
  score: number
  rule_id: string
  rule: string
  line: number
  excerpt: string
  quarantined: boolean
}

interface Quarantine {
  id: number
  orig_path: string
  stored_path: string
  quarantined_by: number | null
  quarantined_at: number
  restored: boolean
}

interface RuleView {
  id: string
  name: string
  score: number
  pattern: string
}

interface Settings {
  scan_dir: string
  quarantine_dir: string
  max_file_size: number
  max_files: number
  score_to_flag: number
}

function statusBadge(status: string): 'online' | 'warn' | 'crit' | 'neutral' {
  if (status === 'done') return 'online'
  if (status === 'running') return 'warn'
  if (status === 'failed') return 'crit'
  return 'neutral'
}

function scoreBadge(score: number): 'crit' | 'warn' | 'neutral' {
  return score >= 10 ? 'crit' : score >= 5 ? 'warn' : 'neutral'
}

/** Malscan 木马查杀(aaPanel 布局):顶部扫描操作区 + 概况 Stat,命中/历史/隔离/规则用紧凑表,配置走固定弹窗。 */
export default function Malscan() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [tasksErr, setTasksErr] = useState<string | null>(null)

  const [dir, setDir] = useState('')
  const [scanning, setScanning] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const loadTasks = useCallback(async () => {
    setTasksErr(null)
    try {
      const list = await apiFetch<Task[]>('/api/m/malscan/tasks')
      setTasks(list)
      setSelectedTaskId((cur) =>
        cur != null && list.some((t) => t.id === cur) ? cur : (list[0]?.id ?? null),
      )
    } catch (e) {
      setTasksErr(errorText(e))
    } finally {
      setTasksLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  async function scan() {
    if (!canWrite || scanning) return
    setScanning(true)
    setFeedback(null)
    try {
      const task = await apiFetch<Task>('/api/m/malscan/scan', {
        method: 'POST',
        body: JSON.stringify({ dir: dir.trim() }),
      })
      setFeedback({
        kind: 'ok',
        text: `扫描 #${task.id} 完成:扫描 ${task.files_scanned} 文件,命中 ${task.flagged_count}`,
      })
      await loadTasks()
      setSelectedTaskId(task.id)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setScanning(false)
    }
  }

  const lastTask = tasks[0] ?? null
  const selectedTask = useMemo(
    () => (selectedTaskId == null ? null : (tasks.find((t) => t.id === selectedTaskId) ?? null)),
    [tasks, selectedTaskId],
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
            木马查杀
          </h1>
          <p className="text-xs text-muted">只读静态扫描可疑文件,隔离需 admin 二次确认。</p>
        </div>
      </header>

      <ScanBar
        dir={dir}
        setDir={setDir}
        canWrite={canWrite}
        scanning={scanning}
        feedback={feedback}
        lastTask={lastTask}
        isAdmin={isAdmin}
        onScan={() => void scan()}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <HitsTable
        task={selectedTask}
        isAdmin={isAdmin}
        canWrite={canWrite}
        onChanged={() => void loadTasks()}
      />

      <HistoryTable
        tasks={tasks}
        loading={tasksLoading}
        loadErr={tasksErr}
        selectedId={selectedTaskId}
        onSelect={setSelectedTaskId}
        onRefresh={() => void loadTasks()}
      />

      <Quarantines isAdmin={isAdmin} />

      <Rules />

      {settingsOpen && <SettingsModal canEdit={isAdmin} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function ScanBar({
  dir,
  setDir,
  canWrite,
  scanning,
  feedback,
  lastTask,
  isAdmin,
  onScan,
  onOpenSettings,
}: {
  dir: string
  setDir: (v: string) => void
  canWrite: boolean
  scanning: boolean
  feedback: Feedback
  lastTask: Task | null
  isAdmin: boolean
  onScan: () => void
  onOpenSettings: () => void
}) {
  return (
    <div className="flex flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-5 shadow-[var(--shadow-card),var(--inset-hl)]">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-56 flex-1">
          <ScanSearch
            size={15}
            className="pointer-events-none absolute left-3 top-9 -translate-y-1/2 text-warn"
          />
          <Input
            label="扫描目录(相对扫描根,留空扫全部)"
            placeholder="例如 wwwroot/site1"
            value={dir}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="pl-9 font-[family-name:var(--font-mono)]"
            onChange={(e) => setDir(e.target.value)}
          />
        </div>
        <Button onClick={onScan} disabled={!canWrite || scanning}>
          {scanning ? <Spinner size={14} /> : <Play size={15} />}
          开始扫描
        </Button>
        <Button variant="ghost" onClick={onOpenSettings}>
          <SlidersHorizontal size={15} />
          扫描配置
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-(--radius-sm) border border-border/60 bg-surface-2 px-5 py-4 sm:grid-cols-4">
        <Stat value={lastTask ? lastTask.files_scanned : '—'} label="上次扫描文件" />
        <Stat
          value={
            lastTask ? (
              <span className={lastTask.flagged_count > 0 ? 'text-crit' : undefined}>
                {lastTask.flagged_count}
              </span>
            ) : (
              '—'
            )
          }
          label="命中可疑"
        />
        <Stat value={lastTask ? lastTask.files_skipped : '—'} label="跳过文件" />
        <Stat
          value={
            lastTask ? <Badge status={statusBadge(lastTask.status)}>{lastTask.status}</Badge> : '—'
          }
          label="上次状态"
        />
      </div>

      {!canWrite && <p className="text-xs text-muted">发起扫描需要 operator 及以上角色。</p>}
      {canWrite && !isAdmin && (
        <p className="text-xs text-muted">隔离与还原需要 admin 角色,忽略需要 operator。</p>
      )}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}

function HitsTable({
  task,
  isAdmin,
  canWrite,
  onChanged,
}: {
  task: Task | null
  isAdmin: boolean
  canWrite: boolean
  onChanged: () => void
}) {
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [detail, setDetail] = useState<Hit | null>(null)

  const taskId = task?.id ?? null
  const hitTime = task?.finished_at ?? task?.started_at ?? null

  const load = useCallback(async () => {
    if (taskId == null) {
      setHits([])
      return
    }
    setLoading(true)
    setLoadErr(null)
    try {
      setHits(await apiFetch<Hit[]>(`/api/m/malscan/tasks/${taskId}/hits`))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  async function quarantine(h: Hit) {
    if (!window.confirm(`确认隔离文件 ${h.path}?文件将被移入隔离区,此操作危险。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/malscan/quarantine', {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({ path: h.path }),
      })
      setFeedback({ kind: 'ok', text: '已隔离' })
      await load()
      onChanged()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function ignore(h: Hit) {
    if (!window.confirm(`确认忽略 ${h.path}?该路径将加入白名单,后续扫描不再告警。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/malscan/whitelist', {
        method: 'POST',
        body: JSON.stringify({ path: h.path }),
      })
      setFeedback({ kind: 'ok', text: '已忽略并加入白名单' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<Hit>[] = useMemo(
    () => [
      {
        key: 'path',
        header: '文件路径',
        cell: (h) => (
          <button
            type="button"
            onClick={() => setDetail(h)}
            className="inline-flex max-w-full items-center gap-2 rounded-sm text-left outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <ShieldAlert size={15} className="shrink-0 text-warn" />
            <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">
              {h.path}
            </span>
          </button>
        ),
      },
      {
        key: 'rule',
        header: '风险类型',
        width: '220px',
        cell: (h) => (
          <span className="inline-flex items-center gap-2">
            <Badge status={scoreBadge(h.score)}>分值 {h.score}</Badge>
            <span className="truncate text-xs text-muted">{h.rule}</span>
          </span>
        ),
      },
      {
        key: 'time',
        header: '命中时间',
        width: '170px',
        cell: () => <span className="text-xs text-muted">{fmtTime(hitTime)}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '170px',
        align: 'right',
        cell: (h) => (
          <ActionLinks>
            <ActionLink onClick={() => setDetail(h)}>查看</ActionLink>
            {h.quarantined ? (
              <ActionLink disabled onClick={() => {}}>
                已隔离
              </ActionLink>
            ) : (
              <ActionLink
                danger
                disabled={!isAdmin || busy}
                title={isAdmin ? '移入隔离区' : '需要 admin 角色'}
                onClick={() => void quarantine(h)}
              >
                隔离
              </ActionLink>
            )}
            <ActionLink
              disabled={!canWrite || busy}
              title={canWrite ? '加入白名单,后续不再告警' : '需要 operator 角色'}
              onClick={() => void ignore(h)}
            >
              忽略
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, canWrite, busy, hitTime],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium text-text">命中文件</h2>
          {task && (
            <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
              扫描 #{task.id} · {task.root}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void load()}
          disabled={loading || taskId == null}
        >
          <RefreshCw size={14} />
          刷新
        </Button>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center rounded-(--radius-card) border border-border bg-surface">
          <Spinner size={20} />
        </div>
      ) : loadErr ? (
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
        </p>
      ) : (
        <Table
          columns={columns}
          rows={hits}
          rowKey={(h) => h.id}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">
                {taskId == null ? '还没有扫描记录' : '未发现可疑文件'}
              </span>
              <span className="text-xs text-muted">
                {taskId == null ? '在上方填写目录并开始扫描。' : '该次扫描很干净,继续保持。'}
              </span>
            </span>
          }
        />
      )}

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      {detail && <HitDetail hit={detail} time={hitTime} onClose={() => setDetail(null)} />}
    </div>
  )
}

function HitDetail({ hit, time, onClose }: { hit: Hit; time: number | null; onClose: () => void }) {
  return (
    <Modal title="命中详情" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={scoreBadge(hit.score)}>分值 {hit.score}</Badge>
          {hit.quarantined && <Badge status="warn">已隔离</Badge>}
          <span className="text-xs text-muted">{hit.rule}</span>
          <span className="ml-auto text-xs text-muted">{fmtTime(time)}</span>
        </div>
        <Field label="文件路径">
          <code className="block break-all font-[family-name:var(--font-mono)] text-xs text-text">
            {hit.path}
          </code>
        </Field>
        <Field label={`命中片段(第 ${hit.line} 行)`}>
          <code className="block max-h-64 overflow-auto break-all rounded-(--radius-sm) bg-bg px-3 py-2 font-[family-name:var(--font-mono)] text-xs text-muted">
            {hit.excerpt}
          </code>
        </Field>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  )
}

function HistoryTable({
  tasks,
  loading,
  loadErr,
  selectedId,
  onSelect,
  onRefresh,
}: {
  tasks: Task[]
  loading: boolean
  loadErr: string | null
  selectedId: number | null
  onSelect: (id: number) => void
  onRefresh: () => void
}) {
  const columns: Column<Task>[] = useMemo(
    () => [
      {
        key: 'id',
        header: '扫描',
        width: '70px',
        cell: (t) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted">#{t.id}</span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '92px',
        cell: (t) => <Badge status={statusBadge(t.status)}>{t.status}</Badge>,
      },
      {
        key: 'root',
        header: '扫描目录',
        cell: (t) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {t.root}
          </span>
        ),
      },
      {
        key: 'counts',
        header: '扫描 / 命中',
        width: '140px',
        cell: (t) => (
          <span className="text-xs text-muted">
            {t.files_scanned} /{' '}
            <span className={t.flagged_count > 0 ? 'text-crit' : 'text-muted'}>
              {t.flagged_count}
            </span>
          </span>
        ),
      },
      {
        key: 'time',
        header: '开始时间',
        width: '170px',
        cell: (t) => <span className="text-xs text-muted">{fmtTime(t.started_at)}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '110px',
        align: 'right',
        cell: (t) => (
          <ActionLinks>
            <ActionLink onClick={() => onSelect(t.id)}>
              <span className="inline-flex items-center gap-1">
                <Eye size={13} />
                查看命中
              </span>
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [onSelect],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text">扫描历史</h2>
        <Button size="sm" variant="ghost" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} />
          刷新
        </Button>
      </div>
      {loading ? (
        <div className="h-32 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : loadErr && tasks.length === 0 ? (
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
        </p>
      ) : (
        <Table
          columns={columns}
          rows={tasks}
          rowKey={(t) => t.id}
          onRowClick={(t) => onSelect(t.id)}
          emptyText="暂无扫描任务,发起一次扫描试试。"
        />
      )}
      {selectedId != null && tasks.length > 0 && (
        <p className="text-xs text-faint">当前查看扫描 #{selectedId} 的命中。</p>
      )}
    </div>
  )
}

function Quarantines({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Quarantine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setItems(await apiFetch<Quarantine[]>('/api/m/malscan/quarantine'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function restore(q: Quarantine) {
    if (!window.confirm(`确认还原 ${q.orig_path}?文件将移回原位,此操作危险。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/malscan/restore', {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({ path: q.orig_path }),
      })
      setFeedback({ kind: 'ok', text: '已还原' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const active = items.filter((q) => !q.restored)

  const columns: Column<Quarantine>[] = useMemo(
    () => [
      {
        key: 'path',
        header: '原始路径',
        cell: (q) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">
            {q.orig_path}
          </span>
        ),
      },
      {
        key: 'time',
        header: '隔离时间',
        width: '170px',
        cell: (q) => <span className="text-xs text-muted">{fmtTime(q.quarantined_at)}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '90px',
        align: 'right',
        cell: (q) => (
          <ActionLinks>
            <ActionLink
              danger
              disabled={!isAdmin || busy}
              title={isAdmin ? '移回原位' : '需要 admin 角色'}
              onClick={() => void restore(q)}
            >
              还原
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, busy],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text">隔离区</h2>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} />
          刷新
        </Button>
      </div>
      {loading ? (
        <div className="flex h-20 items-center justify-center rounded-(--radius-card) border border-border bg-surface">
          <Spinner size={20} />
        </div>
      ) : loadErr && active.length === 0 ? (
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
        </p>
      ) : (
        <Table columns={columns} rows={active} rowKey={(q) => q.id} emptyText="隔离区为空。" />
      )}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}

function SettingsModal({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const [cfg, setCfg] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    try {
      setCfg(await apiFetch<Settings>('/api/m/malscan/settings'))
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
    if (!cfg) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/malscan/settings', { method: 'PUT', body: JSON.stringify(cfg) })
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="扫描配置" size="md" onClose={onClose}>
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : !cfg ? (
        <p className="text-sm text-muted">{feedback?.text ?? '设置不可用,可能需要 admin 角色。'}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="扫描根目录"
              value={cfg.scan_dir}
              spellCheck={false}
              disabled={!canEdit}
              className="font-[family-name:var(--font-mono)]"
              onChange={(e) => setCfg((c) => (c ? { ...c, scan_dir: e.target.value } : c))}
            />
            <Input
              label="隔离区目录"
              value={cfg.quarantine_dir}
              spellCheck={false}
              disabled={!canEdit}
              className="font-[family-name:var(--font-mono)]"
              onChange={(e) => setCfg((c) => (c ? { ...c, quarantine_dir: e.target.value } : c))}
            />
            <Input
              label="单文件大小上限(字节)"
              inputMode="numeric"
              value={String(cfg.max_file_size)}
              disabled={!canEdit}
              onChange={(e) =>
                setCfg((c) => (c ? { ...c, max_file_size: Number(e.target.value) || 0 } : c))
              }
            />
            <Input
              label="单次扫描文件数上限"
              inputMode="numeric"
              value={String(cfg.max_files)}
              disabled={!canEdit}
              onChange={(e) => setCfg((c) => (c ? { ...c, max_files: Number(e.target.value) || 0 } : c))}
            />
            <Input
              label="判定可疑的累计分阈值"
              inputMode="numeric"
              value={String(cfg.score_to_flag)}
              disabled={!canEdit}
              onChange={(e) =>
                setCfg((c) => (c ? { ...c, score_to_flag: Number(e.target.value) || 0 } : c))
              }
            />
          </div>
          {!canEdit && <p className="text-xs text-muted">修改扫描配置需要 admin 角色。</p>}
          {feedback && (
            <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
              {feedback.text}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
            <Button onClick={() => void save()} disabled={!canEdit || busy}>
              {busy && <Spinner size={14} />}
              保存
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Rules() {
  const [rules, setRules] = useState<RuleView[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<RuleView[]>('/api/m/malscan/rules')
      .then(setRules)
      .catch((e) => setLoadErr(errorText(e)))
      .finally(() => setLoading(false))
  }, [])

  const columns: Column<RuleView>[] = useMemo(
    () => [
      {
        key: 'score',
        header: '分值',
        width: '90px',
        cell: (r) => <Badge status={scoreBadge(r.score)}>{r.score}</Badge>,
      },
      {
        key: 'name',
        header: '规则',
        width: '220px',
        cell: (r) => <span className="text-text">{r.name}</span>,
      },
      {
        key: 'pattern',
        header: '匹配模式',
        cell: (r) => (
          <code className="block truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {r.pattern}
          </code>
        ),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-text">检测规则</h2>
      {loading ? (
        <div className="h-32 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : loadErr ? (
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
        </p>
      ) : (
        <Table columns={columns} rows={rules} rowKey={(r) => r.id} emptyText="无内置规则。" />
      )}
    </div>
  )
}
