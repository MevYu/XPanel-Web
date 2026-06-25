import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { IconButton } from '../components/IconButton'
import { Spinner } from '../components/Spinner'
import { Table, ActionLink, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { InstallGate } from '../components/InstallGate'
import {
  Plus,
  Settings2,
  Search,
  Code2,
  Play,
  Pause,
  RotateCw,
  PackageCheck,
  Trash2,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  type Project,
  type RunState,
  DANGER,
  errorText,
  startKindLabel,
  runStateFromStatus,
} from './python/shared'
import { CreateProjectModal } from './python/CreateProjectModal'
import { LogsModal } from './python/LogsModal'
import { SettingsModal } from './python/SettingsModal'

const PAGE_SIZES = [10, 20, 50] as const

/** Python:aaPanel 布局——紧凑表列项目,右上添加项目/设置,状态可点启停,行操作重启/日志 + ⋮ 菜单,状态弹窗。 */
export default function Python() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [states, setStates] = useState<Record<number, RunState>>({})
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [menuId, setMenuId] = useState<number | null>(null)

  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logsId, setLogsId] = useState<number | null>(null)

  const refreshState = useCallback(async (id: number) => {
    try {
      const s = await apiFetch<string>(`/api/m/python/projects/${id}/status`)
      setStates((prev) => ({ ...prev, [id]: runStateFromStatus(typeof s === 'string' ? s : '') }))
    } catch {
      setStates((prev) => ({ ...prev, [id]: 'unknown' }))
    }
  }, [])

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const data = await apiFetch<Project[]>('/api/m/python/projects')
      setProjects(data)
      await Promise.all(data.map((p) => refreshState(p.id)))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [refreshState])

  useEffect(() => {
    void load()
  }, [load])

  async function action(p: Project, verb: 'start' | 'stop' | 'restart') {
    if (!canWrite || togglingId != null) return
    if (verb === 'stop' && !window.confirm(`确认停止项目「${p.name}」?`)) return
    setTogglingId(p.id)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/python/projects/${p.id}/${verb}`, {
        method: 'POST',
        headers: verb === 'stop' ? DANGER : undefined,
      })
      setFeedback({ kind: 'ok', text: `${p.name}:${verb} 已执行` })
      await refreshState(p.id)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setTogglingId(null)
    }
  }

  // 状态列点击:运行中则停止,否则启动(停止走 action 的确认 + DANGER 头)。
  function toggle(p: Project) {
    void action(p, states[p.id] === 'running' ? 'stop' : 'start')
  }

  async function installReqs(p: Project) {
    if (!canWrite) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<string>(`/api/m/python/projects/${p.id}/requirements`, {
        method: 'POST',
      })
      setFeedback({
        kind: 'ok',
        text: typeof res === 'string' && res.trim() ? res.trim() : 'requirements 已安装',
      })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: Project) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除项目「${p.name}」?此操作危险,不可恢复。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/python/projects/${p.id}`, { method: 'DELETE', headers: DANGER })
      setProjects((prev) => prev.filter((x) => x.id !== p.id))
      if (logsId === p.id) setLogsId(null)
      setFeedback({ kind: 'ok', text: '项目已删除' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.project_dir.toLowerCase().includes(q) ||
        p.app_target.toLowerCase().includes(q),
    )
  }, [projects, query])

  // 搜索/每页条数变化或行数缩减时,把当前页夹回有效范围,避免停在空页。
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
          <button
            type="button"
            onClick={() => setLogsId(p.id)}
            className="inline-flex items-center gap-2 rounded-sm font-medium text-text outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <Code2 size={15} className="shrink-0 text-warn" />
            <span className="truncate">{p.name}</span>
          </button>
        ),
      },
      {
        key: 'path',
        header: '路径',
        cell: (p) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {p.project_dir || '—'}
          </span>
        ),
      },
      {
        key: 'port',
        header: '端口',
        width: '80px',
        cell: (p) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
            {p.port > 0 ? p.port : '—'}
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '64px',
        align: 'center',
        cell: (p) => {
          const s = states[p.id]
          if (s === undefined) return <Spinner size={14} />
          const run = s === 'running'
          const toggling = togglingId === p.id
          return (
            <button
              type="button"
              disabled={!canWrite || togglingId != null}
              aria-label={run ? '停止项目' : '启动项目'}
              title={canWrite ? (run ? '运行中,点击停止' : '已停止,点击启动') : '需要 operator 角色'}
              onClick={() => toggle(p)}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-50 ${
                run
                  ? 'text-online hover:bg-online-soft'
                  : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              {toggling ? (
                <Spinner size={14} />
              ) : run ? (
                <Play size={15} className="fill-current" />
              ) : (
                <Pause size={15} className="fill-current" />
              )}
            </button>
          )
        },
      },
      {
        key: 'framework',
        header: '版本 / 框架',
        width: '170px',
        cell: (p) => (
          <span className="flex flex-col text-xs">
            <span className="text-text">{p.interpreter || 'python3'}</span>
            <span className="text-muted">{startKindLabel[p.start_kind] ?? p.start_kind}</span>
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '132px',
        align: 'right',
        cell: (p) => (
          <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
            <ActionLink onClick={() => setLogsId(p.id)}>日志</ActionLink>
            <span className="text-border">|</span>
            <ActionLink disabled={!canWrite || togglingId != null} onClick={() => void action(p, 'restart')}>
              重启
            </ActionLink>
            <span className="text-border">|</span>
            <RowMenu
              open={menuId === p.id}
              onToggle={() => setMenuId((id) => (id === p.id ? null : p.id))}
              onClose={() => setMenuId(null)}
            >
              <MenuItem disabled={!canWrite || togglingId != null} onClick={() => toggle(p)}>
                {states[p.id] === 'running' ? (
                  <>
                    <Pause size={14} /> 停止
                  </>
                ) : (
                  <>
                    <Play size={14} /> 启动
                  </>
                )}
              </MenuItem>
              <MenuItem disabled={!canWrite || togglingId != null} onClick={() => void action(p, 'restart')}>
                <RotateCw size={14} /> 重启
              </MenuItem>
              <MenuItem disabled={!canWrite || busy} onClick={() => void installReqs(p)}>
                <PackageCheck size={14} /> 装依赖
              </MenuItem>
              <MenuItem
                danger
                disabled={!isAdmin || busy}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [states, canWrite, isAdmin, busy, togglingId, menuId],
  )

  const logsProject = logsId == null ? null : (projects.find((p) => p.id === logsId) ?? null)

  return (
    <InstallGate moduleId="python">
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="md"
            disabled={!isAdmin}
            title={isAdmin ? undefined : '创建需要 admin 角色'}
            onClick={() => setCreating(true)}
          >
            <Plus size={15} />
            添加项目
          </Button>
          <Button variant="ghost" size="md" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} />
            设置
          </Button>
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
                icon={<Code2 />}
                title={projects.length === 0 ? '还没有 Python 项目' : '没有匹配的项目'}
                hint={
                  projects.length === 0
                    ? '点击「添加项目」创建第一个 venv 项目。'
                    : '换个关键词试试。'
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

      {!canWrite && (
        <p className="text-xs text-muted">启停 / 装依赖需要 operator 角色,创建与删除需要 admin。</p>
      )}

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      {creating && (
        <CreateProjectModal
          onClose={() => setCreating(false)}
          onCreated={(p) => {
            setProjects((prev) => [...prev, p])
            setCreating(false)
            void refreshState(p.id)
          }}
        />
      )}
      {settingsOpen && <SettingsModal isAdmin={isAdmin} onClose={() => setSettingsOpen(false)} />}
      {logsProject && <LogsModal project={logsProject} onClose={() => setLogsId(null)} />}
    </div>
    </InstallGate>
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
