import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { IconButton } from '../components/IconButton'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { InstallGate } from '../components/InstallGate'
import { Tabs } from '../components/Tabs'
import {
  Plus,
  RefreshCw,
  Settings2,
  Search,
  Coffee,
  Play,
  Pause,
  ScrollText,
  MoreVertical,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

type Filter = 'all' | 'jar' | 'war' | 'tomcat'

const PAGE_SIZES = [10, 20, 50] as const

// 顶部页级 tab,对齐 aaPanel 分段:按部署类型切换列表。
const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'jar', label: 'JAR' },
  { key: 'war', label: 'WAR' },
  { key: 'tomcat', label: 'Tomcat' },
]

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

// 文本端点(supervisor status / 日志)走原始 fetch:apiFetch 强制 JSON.parse,纯文本响应会抛错。
async function fetchText(path: string): Promise<string> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40'

interface Project {
  id: number
  name: string
  type: string
  artifact_path: string
  java_version: string
  jvm_args: string
  port: number
}

interface CreateForm {
  name: string
  type: string
  artifact_path: string
  java_version: string
  jvm_args: string
  port: string
}

interface Settings {
  base_dir: string
  jdk_dir: string
  tomcat_dir: string
  conf_dir: string
  log_dir: string
}

// RunState 由 supervisor status 文本解析得来:列表端点不含运行态,需逐项目查 /status。
type RunState = 'running' | 'stopped' | 'unknown'

function parseRunState(out: string): RunState {
  if (/RUNNING/.test(out)) return 'running'
  if (/STOPPED|EXITED|FATAL|STARTING|BACKOFF/.test(out)) return 'stopped'
  return 'unknown'
}

const runLabel: Record<RunState, string> = {
  running: '运行中',
  stopped: '已停止',
  unknown: '未知',
}

const emptyCreate: CreateForm = {
  name: '',
  type: 'jar',
  artifact_path: '',
  java_version: '',
  jvm_args: '',
  port: '',
}

/** Java 项目:aaPanel 风格——类型 tab、工具栏(左添加/刷新/设置、右搜索)、紧凑表 + 文字行操作 + 添加/设置/日志弹窗。 */
export default function Java() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const isWriter = isAdmin || role === 'operator'

  const [projects, setProjects] = useState<Project[]>([])
  const [states, setStates] = useState<Record<number, RunState>>({})
  const [versions, setVersions] = useState<string[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logFor, setLogFor] = useState<Project | null>(null)
  const [logText, setLogText] = useState('')
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [menuId, setMenuId] = useState<number | null>(null)

  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

  const refreshStates = useCallback(async (ps: Project[]) => {
    const entries = await Promise.all(
      ps.map(async (p) => {
        try {
          return [
            p.id,
            parseRunState(await fetchText(`/api/m/java/projects/${p.id}/status`)),
          ] as const
        } catch {
          return [p.id, 'unknown' as RunState] as const
        }
      }),
    )
    setStates(Object.fromEntries(entries))
  }, [])

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [p, v] = await Promise.all([
        apiFetch<Project[]>('/api/m/java/projects'),
        apiFetch<string[]>('/api/m/java/versions'),
      ])
      setProjects(p)
      setVersions(v)
      void refreshStates(p)
      // 设置只在 admin 下取(展示与编辑限 admin)。
      if (isAdmin) {
        setSettings(await apiFetch<Settings>('/api/m/java/settings'))
      }
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [isAdmin, refreshStates])

  useEffect(() => {
    void load()
  }, [load])

  async function action(p: Project, verb: 'start' | 'stop' | 'restart') {
    if (!isWriter || togglingId != null) return
    if (verb === 'stop' && !window.confirm(`确认停止项目「${p.name}」?`)) return
    setFeedback(null)
    setTogglingId(p.id)
    try {
      await apiFetch(`/api/m/java/projects/${p.id}/${verb}`, {
        method: 'POST',
        headers: verb === 'stop' ? DANGER : undefined,
      })
      setFeedback({ kind: 'ok', text: `项目「${p.name}」${verb} 完成` })
      void refreshStates(projects)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setTogglingId(null)
    }
  }

  // toggle 把可点状态映射到 start/stop:运行中→stop(危险确认),其它→start。
  function toggle(p: Project) {
    if (!isWriter || togglingId != null) return
    void action(p, states[p.id] === 'running' ? 'stop' : 'start')
  }

  async function remove(p: Project) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除项目「${p.name}」?此操作危险且不可恢复。`)) return
    setFeedback(null)
    try {
      await apiFetch(`/api/m/java/projects/${p.id}`, { method: 'DELETE', headers: DANGER })
      if (logFor?.id === p.id) setLogFor(null)
      setFeedback({ kind: 'ok', text: `项目「${p.name}」已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function showLogs(p: Project) {
    setLogFor(p)
    setLogText('加载中…')
    try {
      const text = await fetchText(`/api/m/java/projects/${p.id}/logs?tail=200`)
      setLogText(text.trim() || '(空)')
    } catch (e) {
      setLogText(errorText(e))
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects.filter((p) => {
      if (filter !== 'all' && p.type !== filter) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || p.artifact_path.toLowerCase().includes(q)
    })
  }, [projects, query, filter])

  // 筛选/搜索/每页条数变化或行数缩减时,把当前页夹回有效范围,避免停在空页。
  const total = visible.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  const pageRows = useMemo(
    () => visible.slice(page * pageSize, page * pageSize + pageSize),
    [visible, page, pageSize],
  )

  const columns: Column<Project>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '项目名',
        cell: (p) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="inline-flex items-center gap-2 font-medium text-text">
              <Coffee size={15} className="shrink-0 text-warn" />
              <span className="truncate">{p.name}</span>
            </span>
            <span className="truncate pl-[23px] font-[family-name:var(--font-mono)] text-[11px] text-faint">
              {p.artifact_path || '—'}
            </span>
          </div>
        ),
      },
      {
        key: 'port',
        header: '端口',
        width: '80px',
        cell: (p) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted">:{p.port}</span>
        ),
      },
      {
        key: 'state',
        header: '状态',
        width: '64px',
        align: 'center',
        cell: (p) => {
          const st = states[p.id] ?? 'unknown'
          const running = st === 'running'
          const busy = togglingId === p.id
          return (
            <button
              type="button"
              disabled={!isWriter || busy}
              aria-label={running ? '停止项目' : '启动项目'}
              title={
                isWriter
                  ? `${runLabel[st]},点击${running ? '停止' : '启动'}`
                  : '需要 operator 角色'
              }
              onClick={() => toggle(p)}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-50 ${
                running
                  ? 'text-online hover:bg-online-soft'
                  : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              {busy ? (
                <Spinner size={14} />
              ) : running ? (
                <Play size={15} className="fill-current" />
              ) : (
                <Pause size={15} className="fill-current" />
              )}
            </button>
          )
        },
      },
      {
        key: 'type',
        header: '类型',
        width: '92px',
        cell: (p) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted">{p.type}</span>
        ),
      },
      {
        key: 'jdk',
        header: 'JDK',
        width: '92px',
        cell: (p) => <span className="text-xs text-muted">{p.java_version || '系统默认'}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '196px',
        align: 'right',
        cell: (p) => (
          <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
            <ActionLinks>
              <ActionLink
                disabled={!isWriter}
                title={isWriter ? '重启' : '需要 operator 角色'}
                onClick={() => void action(p, 'restart')}
              >
                重启
              </ActionLink>
              <ActionLink onClick={() => void showLogs(p)}>日志</ActionLink>
            </ActionLinks>
            <span className="text-border">|</span>
            <RowMenu
              open={menuId === p.id}
              onToggle={() => setMenuId((id) => (id === p.id ? null : p.id))}
              onClose={() => setMenuId(null)}
            >
              <MenuItem
                disabled={!isWriter}
                title={isWriter ? '启动' : '需要 operator 角色'}
                onClick={() => void action(p, 'start')}
              >
                <Play size={14} /> 启动
              </MenuItem>
              <MenuItem
                disabled={!isWriter}
                title={isWriter ? '停止' : '需要 operator 角色'}
                onClick={() => void action(p, 'stop')}
              >
                <Pause size={14} /> 停止
              </MenuItem>
              <MenuItem onClick={() => void showLogs(p)}>
                <ScrollText size={14} /> 日志
              </MenuItem>
              <MenuItem
                danger
                disabled={!isAdmin}
                title={isAdmin ? '删除项目' : '需要 admin 角色'}
                onClick={() => void remove(p)}
              >
                <Trash2 size={14} /> 删除
              </MenuItem>
            </RowMenu>
          </span>
        ),
      },
    ],
    // action/remove/showLogs 闭包捕获 projects/states/角色,据此重建列。
    [isAdmin, isWriter, states, projects, togglingId, menuId],
  )

  return (
    <InstallGate moduleId="java">
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS} active={filter} onChange={setFilter} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="md"
            disabled={!isAdmin}
            title={isAdmin ? '添加项目' : '需要 admin 角色'}
            onClick={() => {
              setFeedback(null)
              setCreating(true)
            }}
          >
            <Plus size={15} />
            添加项目
          </Button>
          <Button variant="ghost" size="md" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} />
            刷新
          </Button>
          {isAdmin && (
            <Button variant="ghost" size="md" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={15} />
              设置
            </Button>
          )}
        </div>
        <div className="relative w-56">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索项目名或路径"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
      </div>

      {loadErr && projects.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      {loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : (
        <>
          <Table
            columns={columns}
            rows={pageRows}
            rowKey={(p) => p.id}
            emptyText={
              <EmptyState
                icon={<Coffee />}
                title={projects.length === 0 ? '还没有 Java 项目' : '没有匹配的项目'}
                hint={
                  projects.length === 0
                    ? isAdmin
                      ? '点击「添加项目」部署你的第一个 jar / war。'
                      : '创建项目需要 admin 角色。'
                    : '换个关键词或筛选条件试试。'
                }
              />
            }
          />
          {total > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
              <span className="tabular-nums">共 {total} 条</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(0)
                }}
                aria-label="每页条数"
                className="h-8 rounded-(--radius-sm) border border-border bg-surface-2 px-2 text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} 条/页
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <IconButton
                  aria-label="上一页"
                  className="h-8 w-8"
                  disabled={page === 0}
                  icon={<ChevronLeft size={16} />}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                />
                <span className="tabular-nums px-1">
                  {page + 1} / {pageCount}
                </span>
                <IconButton
                  aria-label="下一页"
                  className="h-8 w-8"
                  disabled={page >= pageCount - 1}
                  icon={<ChevronRight size={16} />}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                />
              </div>
            </div>
          )}
        </>
      )}

      {!isWriter && (
        <p className="text-xs text-muted">启停重启需要 operator 角色,创建与删除需要 admin。</p>
      )}

      {creating && (
        <CreateProjectModal
          versions={versions}
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false)
            setFeedback({ kind: 'ok', text: `项目「${name}」已创建` })
            void load()
          }}
        />
      )}

      {logFor && (
        <Modal title={`日志 — ${logFor.name}`} size="lg" onClose={() => setLogFor(null)}>
          <pre className="overflow-auto rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-muted">
            {logText}
          </pre>
        </Modal>
      )}

      {settingsOpen && isAdmin && settings && (
        <SettingsModal
          initial={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setSettings(s)
            setSettingsOpen(false)
            setFeedback({ kind: 'ok', text: '设置已保存' })
          }}
        />
      )}
    </div>
    </InstallGate>
  )
}

/** CreateProjectModal 固定尺寸添加项目弹窗:后端契约要求 admin(可指定任意命令/JVM 参数,属提权)。 */
function CreateProjectModal({
  versions,
  onClose,
  onCreated,
}: {
  versions: string[]
  onClose: () => void
  onCreated: (name: string) => void
}) {
  const [form, setForm] = useState<CreateForm>(emptyCreate)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const name = form.name.trim()
  const portNum = Number(form.port)
  const canCreate =
    !busy &&
    name.length > 0 &&
    form.artifact_path.trim().length > 0 &&
    Number.isInteger(portNum) &&
    portNum >= 1 &&
    portNum <= 65535

  async function create() {
    if (!canCreate) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/java/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          type: form.type,
          artifact_path: form.artifact_path.trim(),
          java_version: form.java_version.trim(),
          jvm_args: form.jvm_args.trim(),
          port: portNum,
        }),
      })
      onCreated(name)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="添加项目" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="项目名"
          placeholder="例如 demo-api"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">部署类型</span>
          <select
            className={fieldClass}
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
          >
            <option value="jar">jar(独立进程)</option>
            <option value="war">war(独立进程)</option>
            <option value="tomcat">tomcat(部署到 Tomcat)</option>
          </select>
        </label>
        <Input
          label="构件路径 (artifact_path)"
          placeholder="基目录内相对/绝对路径,如 demo/app.jar"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          value={form.artifact_path}
          onChange={(e) => setForm((f) => ({ ...f, artifact_path: e.target.value }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">JDK 版本</span>
            <select
              className={fieldClass}
              value={form.java_version}
              onChange={(e) => setForm((f) => ({ ...f, java_version: e.target.value }))}
            >
              <option value="">系统默认</option>
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="端口"
            inputMode="numeric"
            placeholder="1-65535"
            value={form.port}
            onChange={(e) =>
              setForm((f) => ({ ...f, port: e.target.value.replace(/\D/g, '').slice(0, 5) }))
            }
          />
        </div>
        <Input
          label="JVM 参数 (jvm_args)"
          placeholder="如 -Xmx512m -Dspring.profiles.active=prod"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          value={form.jvm_args}
          onChange={(e) => setForm((f) => ({ ...f, jvm_args: e.target.value }))}
        />
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void create()} disabled={!canCreate}>
            {busy && <Spinner size={14} />}
            创建
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const SETTING_FIELDS = [
  ['base_dir', '项目根基目录 (base_dir)'],
  ['jdk_dir', 'JDK bin 目录 (jdk_dir)'],
  ['tomcat_dir', 'Tomcat 目录 (tomcat_dir)'],
  ['conf_dir', '进程配置目录 (conf_dir)'],
  ['log_dir', '日志目录 (log_dir)'],
] as const

/** SettingsModal 路径设置弹窗:后端契约要求 admin。 */
function SettingsModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Settings
  onClose: () => void
  onSaved: (s: Settings) => void
}) {
  const [settings, setSettings] = useState<Settings>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      const res = await apiFetch<Settings>('/api/m/java/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      onSaved(res)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="设置(路径)" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {SETTING_FIELDS.map(([key, label]) => (
            <Input
              key={key}
              label={label}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={settings[key]}
              onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
            />
          ))}
        </div>
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy && <Spinner size={14} />}
            保存设置
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * RowMenu 行内「更多」下拉:⋮ 触发,菜单用 fixed 定位脱离表格 overflow 裁剪;
 * 点击外部或 Escape 关闭。受控 open,父层用 menuId 保证同时只开一个。
 */
function RowMenu({
  open,
  onToggle,
  onClose,
  children,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  function handleToggle(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    onToggle()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <span ref={wrapRef} className="inline-flex">
      <IconButton
        aria-label="更多操作"
        title="更多操作"
        className="h-7 w-7"
        icon={<MoreVertical size={16} />}
        onClick={handleToggle}
      />
      {open && pos && (
        <div
          role="menu"
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 min-w-32 overflow-hidden rounded-(--radius-sm) border border-border bg-surface py-1 shadow-lg"
          onClick={onClose}
        >
          {children}
        </div>
      )}
    </span>
  )
}

/** MenuItem RowMenu 内的一行操作项:图标 + 文案,danger 走危险色,disabled 不可点。 */
function MenuItem({
  onClick,
  children,
  danger,
  disabled,
  title,
}: {
  onClick: () => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] outline-none transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-muted hover:bg-crit-soft hover:text-crit' : 'text-text hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}
