import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Input } from '../components/Input'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Plus, Settings2, Search, Hexagon } from 'lucide-react'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

const selectClass =
  'h-10 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

interface Project {
  id: number
  name: string
  directory: string
  command: string
  port: number
  node_version: string
  created_by: number | null
  created_at: number
  updated_at: number
}

interface NodeSettings {
  base_dir: string
  node_dir: string
  conf_dir: string
  log_dir: string
}

const emptySettings: NodeSettings = { base_dir: '', node_dir: '', conf_dir: '', log_dir: '' }

interface CreateForm {
  name: string
  directory: string
  command: string
  port: string
  node_version: string
}

const emptyForm: CreateForm = { name: '', directory: '', command: '', port: '', node_version: '' }

// supervisor 状态文本含 RUNNING 视为运行中,其余(STOPPED/FATAL/…)按已停止处理。
function isRunning(status: string): boolean {
  return /RUNNING/i.test(status)
}

/** Nodejs:紧凑项目表 + 添加项目弹窗 + 日志弹窗 + 路径设置弹窗(对标 aaPanel 项目列表)。 */
export default function Nodejs() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [projects, setProjects] = useState<Project[]>([])
  const [statuses, setStatuses] = useState<Record<number, string>>({})
  const [nodeVersions, setNodeVersions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CreateForm>(emptyForm)

  const [logProject, setLogProject] = useState<Project | null>(null)
  const [logStatus, setLogStatus] = useState('')
  const [logs, setLogs] = useState('')
  const [stream, setStream] = useState<'stdout' | 'stderr'>('stdout')

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<NodeSettings>(emptySettings)
  const [settingsBusy, setSettingsBusy] = useState(false)

  const refreshStatus = useCallback(async (id: number) => {
    try {
      const s = await apiFetch<string>(`/api/m/nodejs/projects/${id}/status`)
      setStatuses((prev) => ({ ...prev, [id]: typeof s === 'string' ? s : '' }))
    } catch {
      setStatuses((prev) => ({ ...prev, [id]: '' }))
    }
  }, [])

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [ps, vs] = await Promise.all([
        apiFetch<Project[]>('/api/m/nodejs/projects'),
        apiFetch<string[]>('/api/m/nodejs/versions').catch(() => [] as string[]),
      ])
      setProjects(ps)
      setNodeVersions(vs ?? [])
      void Promise.all(ps.map((p) => refreshStatus(p.id)))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [refreshStatus])

  useEffect(() => {
    void load()
  }, [load])

  const portNum = Number(form.port)
  const portValid = Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535
  const canSubmit =
    form.name.trim().length > 0 &&
    form.directory.trim().length > 0 &&
    form.command.trim().length > 0 &&
    portValid &&
    !busy &&
    isAdmin

  async function create() {
    if (!canSubmit) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/nodejs/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          directory: form.directory.trim(),
          command: form.command.trim(),
          port: portNum,
          node_version: form.node_version.trim(),
        }),
      })
      setFeedback({ kind: 'ok', text: '项目已创建' })
      setForm(emptyForm)
      setCreating(false)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function action(p: Project, verb: 'start' | 'stop' | 'restart') {
    if (!canWrite) return
    if (verb === 'stop' && !window.confirm(`确认停止项目「${p.name}」?`)) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<string>(`/api/m/nodejs/projects/${p.id}/${verb}`, {
        method: 'POST',
        headers: verb === 'stop' ? DANGER : undefined,
      })
      setFeedback({ kind: 'ok', text: `${p.name}:${verb} 已执行` })
      if (logProject?.id === p.id) setLogStatus(typeof res === 'string' ? res : '')
      await refreshStatus(p.id)
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
      await apiFetch(`/api/m/nodejs/projects/${p.id}`, { method: 'DELETE', headers: DANGER })
      if (logProject?.id === p.id) setLogProject(null)
      setFeedback({ kind: 'ok', text: '项目已删除' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const loadLogs = useCallback(async (id: number, which: 'stdout' | 'stderr') => {
    try {
      const q = which === 'stderr' ? '?stream=stderr&tail=200' : '?tail=200'
      const l = await apiFetch<string>(`/api/m/nodejs/projects/${id}/logs${q}`)
      setLogs(typeof l === 'string' ? l : '')
    } catch (e) {
      setLogs(errorText(e))
    }
  }, [])

  async function openLogs(p: Project) {
    setLogProject(p)
    setLogStatus(statuses[p.id] ?? '')
    setLogs('')
    setStream('stdout')
    await Promise.all([refreshStatus(p.id), loadLogs(p.id, 'stdout')])
  }

  function switchStream(id: number, which: 'stdout' | 'stderr') {
    setStream(which)
    void loadLogs(id, which)
  }

  async function openSettings() {
    setSettingsOpen(true)
    try {
      const s = await apiFetch<NodeSettings>('/api/m/nodejs/settings')
      setSettings(s)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function saveSettings() {
    if (!isAdmin) return
    setSettingsBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/nodejs/settings', { method: 'PUT', body: JSON.stringify(settings) })
      setFeedback({ kind: 'ok', text: '设置已保存' })
      setSettingsOpen(false)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setSettingsBusy(false)
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.directory.toLowerCase().includes(q),
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
            onClick={() => void openLogs(p)}
            className="inline-flex items-center gap-2 rounded-sm font-medium text-text outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <Hexagon size={15} className="shrink-0 text-warn" />
            <span className="truncate">{p.name}</span>
          </button>
        ),
      },
      {
        key: 'directory',
        header: '路径',
        cell: (p) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {p.directory || '—'}
          </span>
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
        key: 'status',
        header: '状态',
        width: '92px',
        cell: (p) => {
          const s = statuses[p.id]
          if (s === undefined) return <span className="text-xs text-faint">…</span>
          const run = isRunning(s)
          return <Badge status={run ? 'online' : 'neutral'}>{run ? '运行中' : '已停止'}</Badge>
        },
      },
      {
        key: 'command',
        header: '启动命令',
        cell: (p) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {p.command}
            {p.node_version && <span className="text-text/60"> · {p.node_version}</span>}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '230px',
        align: 'right',
        cell: (p) => (
          <ActionLinks>
            <ActionLink disabled={!canWrite || busy} onClick={() => void action(p, 'start')}>
              启动
            </ActionLink>
            <ActionLink danger disabled={!canWrite || busy} onClick={() => void action(p, 'stop')}>
              停止
            </ActionLink>
            <ActionLink disabled={!canWrite || busy} onClick={() => void action(p, 'restart')}>
              重启
            </ActionLink>
            <ActionLink onClick={() => void openLogs(p)}>日志</ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin || busy}
              title={isAdmin ? '删除项目' : '需要 admin 角色'}
              onClick={() => void remove(p)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statuses, isAdmin, canWrite, busy],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="md"
            disabled={!isAdmin}
            title={isAdmin ? undefined : '创建项目需要 admin 角色'}
            onClick={() => {
              setForm(emptyForm)
              setCreating(true)
            }}
          >
            <Plus size={15} />
            添加项目
          </Button>
          <Button variant="ghost" size="md" onClick={() => void openSettings()}>
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
                {projects.length === 0 ? '还没有项目' : '没有匹配的项目'}
              </span>
              <span className="text-xs text-muted">
                {projects.length === 0
                  ? '点击「添加项目」托管你的第一个 Node 进程。'
                  : '换个关键词试试。'}
              </span>
            </span>
          }
        />
      )}

      {!canWrite && (
        <p className="text-xs text-muted">启停需要 operator 角色,创建与删除需要 admin。</p>
      )}

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      {creating && (
        <Modal title="添加项目" size="sm" onClose={() => setCreating(false)}>
          <div className="flex flex-col gap-4">
            <Input
              label="名称"
              placeholder="项目名"
              value={form.name}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoFocus
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="目录"
              placeholder="相对 base_dir 或绝对路径"
              value={form.directory}
              spellCheck={false}
              className="font-[family-name:var(--font-mono)]"
              onChange={(e) => setForm((f) => ({ ...f, directory: e.target.value }))}
            />
            <Input
              label="启动命令"
              placeholder="例如 node index.js"
              value={form.command}
              spellCheck={false}
              className="font-[family-name:var(--font-mono)]"
              onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
            />
            <Input
              label="端口"
              placeholder="1-65535"
              inputMode="numeric"
              value={form.port}
              error={form.port.length > 0 && !portValid ? '端口需为 1–65535' : undefined}
              onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">Node 版本</span>
              <select
                value={form.node_version}
                onChange={(e) => setForm((f) => ({ ...f, node_version: e.target.value }))}
                className={selectClass}
              >
                <option value="">默认</option>
                {nodeVersions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            {!isAdmin && <p className="text-xs text-muted">创建项目需要 admin 角色。</p>}

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>
                取消
              </Button>
              <Button onClick={() => void create()} disabled={!canSubmit}>
                {busy && <Spinner size={14} />}
                创建
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {logProject && (
        <Modal title={`${logProject.name} · 日志`} size="lg" onClose={() => setLogProject(null)}>
          <div className="flex h-full flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">状态</span>
              <pre className="max-h-32 overflow-auto rounded-(--radius-sm) bg-surface p-3 font-[family-name:var(--font-mono)] text-xs whitespace-pre-wrap text-text">
                {logStatus.trim() || '无状态输出'}
              </pre>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted">日志</span>
              <Button
                size="sm"
                variant={stream === 'stdout' ? 'primary' : 'ghost'}
                onClick={() => switchStream(logProject.id, 'stdout')}
              >
                stdout
              </Button>
              <Button
                size="sm"
                variant={stream === 'stderr' ? 'primary' : 'ghost'}
                onClick={() => switchStream(logProject.id, 'stderr')}
              >
                stderr
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void loadLogs(logProject.id, stream)}
              >
                刷新
              </Button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto rounded-(--radius-sm) bg-surface p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed whitespace-pre-wrap text-text">
              {logs.trim() || '无日志输出'}
            </pre>
          </div>
        </Modal>
      )}

      {settingsOpen && (
        <Modal title="Node 设置" size="md" onClose={() => setSettingsOpen(false)}>
          <div className="flex flex-col gap-4">
            <Input
              label="项目根目录 base_dir"
              value={settings.base_dir}
              spellCheck={false}
              disabled={!isAdmin}
              onChange={(e) => setSettings((s) => ({ ...s, base_dir: e.target.value }))}
            />
            <Input
              label="Node 安装目录 node_dir"
              value={settings.node_dir}
              spellCheck={false}
              disabled={!isAdmin}
              onChange={(e) => setSettings((s) => ({ ...s, node_dir: e.target.value }))}
            />
            <Input
              label="进程配置目录 conf_dir"
              value={settings.conf_dir}
              spellCheck={false}
              disabled={!isAdmin}
              onChange={(e) => setSettings((s) => ({ ...s, conf_dir: e.target.value }))}
            />
            <Input
              label="日志目录 log_dir"
              value={settings.log_dir}
              spellCheck={false}
              disabled={!isAdmin}
              onChange={(e) => setSettings((s) => ({ ...s, log_dir: e.target.value }))}
            />
            {!isAdmin && <p className="text-xs text-muted">设置需要 admin 角色。</p>}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
                关闭
              </Button>
              {isAdmin && (
                <Button onClick={() => void saveSettings()} disabled={settingsBusy}>
                  {settingsBusy && <Spinner size={14} />}
                  保存设置
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
