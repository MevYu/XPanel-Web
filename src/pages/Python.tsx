import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Plus, Settings2, Search, Code2 } from 'lucide-react'
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

const runBadge: Record<RunState, { status: 'online' | 'neutral' | 'crit'; label: string }> = {
  running: { status: 'online', label: '运行中' },
  stopped: { status: 'crit', label: '已停止' },
  unknown: { status: 'neutral', label: '未知' },
}

/** Python:aaPanel 布局——紧凑表列项目,右上添加项目/设置,行操作启停/重启/日志/删除,状态弹窗。 */
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
    if (!canWrite) return
    if (verb === 'stop' && !window.confirm(`确认停止项目「${p.name}」?`)) return
    setBusy(true)
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
      setBusy(false)
    }
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
        header: '运行状态',
        width: '100px',
        cell: (p) => {
          const b = runBadge[states[p.id] ?? 'unknown']
          return <Badge status={b.status}>{b.label}</Badge>
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
        width: '270px',
        align: 'right',
        cell: (p) => (
          <ActionLinks>
            <ActionLink disabled={!canWrite || busy} onClick={() => void action(p, 'start')}>
              启动
            </ActionLink>
            <ActionLink disabled={!canWrite || busy} onClick={() => void action(p, 'stop')}>
              停止
            </ActionLink>
            <ActionLink disabled={!canWrite || busy} onClick={() => void action(p, 'restart')}>
              重启
            </ActionLink>
            <ActionLink disabled={!canWrite || busy} onClick={() => void installReqs(p)}>
              装依赖
            </ActionLink>
            <ActionLink onClick={() => setLogsId(p.id)}>日志</ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin || busy}
              aria-label="删除项目"
              title={isAdmin ? '删除项目' : '需要 admin 角色'}
              onClick={() => void remove(p)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [states, canWrite, isAdmin, busy],
  )

  const logsProject = logsId == null ? null : (projects.find((p) => p.id === logsId) ?? null)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
            Python 项目
          </h1>
          <p className="text-xs text-muted">
            {projects.length > 0
              ? `共 ${projects.length} 个项目`
              : '管理 Python 项目:venv、依赖、进程启停与日志'}
          </p>
        </div>
      </header>

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
        <Table
          columns={columns}
          rows={visible}
          rowKey={(p) => p.id}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">
                {projects.length === 0 ? '还没有 Python 项目' : '没有匹配的项目'}
              </span>
              <span className="text-xs text-muted">
                {projects.length === 0
                  ? '点击「添加项目」创建第一个 venv 项目。'
                  : '换个关键词试试。'}
              </span>
            </span>
          }
        />
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
  )
}
