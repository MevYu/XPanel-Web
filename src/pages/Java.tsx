import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Input } from '../components/Input'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Plus, RefreshCw, Settings2, Coffee } from 'lucide-react'

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

const runBadge: Record<RunState, { status: 'online' | 'neutral' | 'warn'; label: string }> = {
  running: { status: 'online', label: '运行中' },
  stopped: { status: 'neutral', label: '已停止' },
  unknown: { status: 'warn', label: '未知' },
}

const emptyCreate: CreateForm = {
  name: '',
  type: 'jar',
  artifact_path: '',
  java_version: '',
  jvm_args: '',
  port: '',
}

/** Java 项目:aaPanel 风格紧凑表(项目名/路径/端口/运行态/类型/JDK/操作)+ 添加/设置/日志弹窗。 */
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

  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logFor, setLogFor] = useState<Project | null>(null)
  const [logText, setLogText] = useState('')

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
    if (!isWriter) return
    if (verb === 'stop' && !window.confirm(`确认停止项目「${p.name}」?`)) return
    setFeedback(null)
    try {
      await apiFetch(`/api/m/java/projects/${p.id}/${verb}`, {
        method: 'POST',
        headers: verb === 'stop' ? DANGER : undefined,
      })
      setFeedback({ kind: 'ok', text: `项目「${p.name}」${verb} 完成` })
      void refreshStates(projects)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
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

  const columns: Column<Project>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '项目名',
        cell: (p) => (
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <Coffee size={15} className="shrink-0 text-warn" />
            <span className="truncate">{p.name}</span>
          </span>
        ),
      },
      {
        key: 'artifact',
        header: '路径',
        cell: (p) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {p.artifact_path}
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
        key: 'state',
        header: '运行状态',
        width: '100px',
        cell: (p) => {
          const b = runBadge[states[p.id] ?? 'unknown']
          return <Badge status={b.status}>{b.label}</Badge>
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
        width: '232px',
        align: 'right',
        cell: (p) => (
          <ActionLinks>
            <ActionLink
              disabled={!isWriter}
              title={isWriter ? '启动' : '需要 operator 角色'}
              onClick={() => void action(p, 'start')}
            >
              启动
            </ActionLink>
            <ActionLink
              disabled={!isWriter}
              title={isWriter ? '停止' : '需要 operator 角色'}
              onClick={() => void action(p, 'stop')}
            >
              停止
            </ActionLink>
            <ActionLink
              disabled={!isWriter}
              title={isWriter ? '重启' : '需要 operator 角色'}
              onClick={() => void action(p, 'restart')}
            >
              重启
            </ActionLink>
            <ActionLink onClick={() => void showLogs(p)}>日志</ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin}
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
    // action/remove/showLogs 闭包捕获 projects/states/角色,据此重建列。
    [isAdmin, isWriter, states, projects],
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
            Java 项目
          </h1>
          <p className="text-xs text-muted">
            {projects.length > 0
              ? `共 ${projects.length} 个项目`
              : '管理 jar / war / tomcat 部署,支持启停重启与日志'}
          </p>
        </div>
      </header>

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
        <Table
          columns={columns}
          rows={projects}
          rowKey={(p) => p.id}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">还没有 Java 项目</span>
              <span className="text-xs text-muted">
                {isAdmin ? '点击「添加项目」部署你的第一个 jar / war。' : '创建项目需要 admin 角色。'}
              </span>
            </span>
          }
        />
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
