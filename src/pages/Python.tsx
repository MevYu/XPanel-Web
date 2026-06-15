import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

const selectClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

interface Project {
  id: number
  name: string
  project_dir: string
  venv_dir: string
  interpreter: string
  start_kind: string
  app_target: string
  port: number
  workers: number
  created_by: number | null
  created_at: number
  updated_at: number
}

interface PySettings {
  project_root: string
  venv_root: string
  interpreter: string
  conf_dir: string
  log_dir: string
}

const emptySettings: PySettings = {
  project_root: '',
  venv_root: '',
  interpreter: '',
  conf_dir: '',
  log_dir: '',
}

type StartKind = 'gunicorn' | 'uvicorn' | 'script'

interface CreateForm {
  name: string
  interpreter: string
  start_kind: StartKind
  app_target: string
  port: string
  workers: string
}

const emptyForm: CreateForm = {
  name: '',
  interpreter: '',
  start_kind: 'gunicorn',
  app_target: '',
  port: '',
  workers: '1',
}

/** Python:列出项目,创建(解释器/启动方式/端口/venv),装 requirements,启停/重启,状态与日志,设置。 */
export default function Python() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState<CreateForm>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [openId, setOpenId] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [logs, setLogs] = useState('')

  const [settings, setSettings] = useState<PySettings>(emptySettings)
  const [showSettings, setShowSettings] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const data = await apiFetch<Project[]>('/api/m/python/projects')
      setProjects(data)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const isScript = form.start_kind === 'script'
  const portNum = Number(form.port)
  const portValid = isScript || (Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535)
  const workersNum = Number(form.workers)
  const workersValid = Number.isInteger(workersNum) && workersNum >= 1 && workersNum <= 256
  const canSubmit =
    form.name.trim().length > 0 &&
    form.app_target.trim().length > 0 &&
    portValid &&
    workersValid &&
    !busy &&
    canWrite

  async function create() {
    if (!canSubmit) return
    setBusy(true)
    setFeedback(null)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        interpreter: form.interpreter.trim(),
        start_kind: form.start_kind,
        app_target: form.app_target.trim(),
        workers: workersNum,
      }
      if (!isScript) body.port = portNum
      else if (form.port.trim()) body.port = portNum
      await apiFetch('/api/m/python/projects', { method: 'POST', body: JSON.stringify(body) })
      setFeedback({ kind: 'ok', text: '项目已创建' })
      setForm(emptyForm)
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
      await apiFetch(`/api/m/python/projects/${p.id}/${verb}`, {
        method: 'POST',
        headers: verb === 'stop' ? DANGER : undefined,
      })
      setFeedback({ kind: 'ok', text: `${p.name}:${verb} 已执行` })
      if (openId === p.id) await refreshStatus(p.id)
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
      setFeedback({ kind: 'ok', text: typeof res === 'string' && res.trim() ? res.trim() : 'requirements 已安装' })
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
      if (openId === p.id) setOpenId(null)
      setFeedback({ kind: 'ok', text: '项目已删除' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function refreshStatus(id: number) {
    try {
      const s = await apiFetch<string>(`/api/m/python/projects/${id}/status`)
      setStatus(typeof s === 'string' ? s : '')
    } catch (e) {
      setStatus(errorText(e))
    }
  }

  const loadLogs = useCallback(async (id: number) => {
    try {
      const l = await apiFetch<string>(`/api/m/python/projects/${id}/logs?tail=200`)
      setLogs(typeof l === 'string' ? l : '')
    } catch (e) {
      setLogs(errorText(e))
    }
  }, [])

  async function open(p: Project) {
    if (openId === p.id) {
      setOpenId(null)
      return
    }
    setOpenId(p.id)
    setStatus('')
    setLogs('')
    await Promise.all([refreshStatus(p.id), loadLogs(p.id)])
  }

  async function openSettings() {
    if (showSettings) {
      setShowSettings(false)
      return
    }
    setShowSettings(true)
    try {
      const s = await apiFetch<PySettings>('/api/m/python/settings')
      setSettings(s)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function saveSettings() {
    if (!isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/python/settings', { method: 'PUT', body: JSON.stringify(settings) })
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">创建项目</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="名称"
            placeholder="项目名"
            value={form.name}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="解释器"
            placeholder="留空用默认,如 python3.11"
            value={form.interpreter}
            spellCheck={false}
            onChange={(e) => setForm((f) => ({ ...f, interpreter: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">启动方式</span>
            <select
              value={form.start_kind}
              onChange={(e) => setForm((f) => ({ ...f, start_kind: e.target.value as StartKind }))}
              className={selectClass}
            >
              <option value="gunicorn">gunicorn</option>
              <option value="uvicorn">uvicorn</option>
              <option value="script">script</option>
            </select>
          </label>
          <Input
            label={isScript ? '脚本路径' : '应用入口 app_target'}
            placeholder={isScript ? '相对脚本路径' : 'module:app'}
            value={form.app_target}
            spellCheck={false}
            className="font-[family-name:var(--font-mono)]"
            onChange={(e) => setForm((f) => ({ ...f, app_target: e.target.value }))}
          />
          <Input
            label={isScript ? '端口(可选)' : '端口'}
            placeholder="1-65535"
            inputMode="numeric"
            value={form.port}
            error={form.port.length > 0 && !portValid ? '端口需为 1–65535' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
          />
          <Input
            label="worker 数"
            placeholder="1-256"
            inputMode="numeric"
            value={form.workers}
            error={form.workers.length > 0 && !workersValid ? 'worker 需为 1–256' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, workers: e.target.value }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void create()} disabled={!canSubmit}>
            创建
          </Button>
          {busy && <Spinner size={16} />}
        </div>
        <p className="text-xs text-muted">创建时会按解释器建立 venv。</p>
        {!canWrite && <p className="text-xs text-muted">创建与启停需要 operator 角色。</p>}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">项目列表</span>
          <Button size="sm" variant="ghost" onClick={() => void openSettings()}>
            {showSettings ? '收起设置' : '设置'}
          </Button>
        </div>

        {showSettings && (
          <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="项目根目录 project_root"
                value={settings.project_root}
                spellCheck={false}
                disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, project_root: e.target.value }))}
              />
              <Input
                label="venv 根目录 venv_root"
                value={settings.venv_root}
                spellCheck={false}
                disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, venv_root: e.target.value }))}
              />
              <Input
                label="默认解释器 interpreter"
                value={settings.interpreter}
                spellCheck={false}
                disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, interpreter: e.target.value }))}
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
            </div>
            <div>
              <Button size="sm" onClick={() => void saveSettings()} disabled={!isAdmin || busy}>
                保存设置
              </Button>
            </div>
            {!isAdmin && <p className="text-xs text-muted">设置需要 admin 角色。</p>}
          </div>
        )}

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && projects.length === 0 ? (
          <p className="p-5 text-sm text-muted">{loadErr}</p>
        ) : projects.length === 0 ? (
          <p className="p-5 text-sm text-muted">暂无项目。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {projects.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 px-5 py-3.5">
                <div className="flex items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{p.name}</span>
                      <Badge status="neutral">{p.start_kind}</Badge>
                      {p.port > 0 && <Badge status="neutral">:{p.port}</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-[family-name:var(--font-mono)] text-xs text-muted">
                      <span className="truncate">{p.project_dir}</span>
                      <span className="truncate">{p.app_target}</span>
                      <span>{p.interpreter}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => void open(p)}>
                      {openId === p.id ? '收起' : '详情'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void installReqs(p)} disabled={!canWrite || busy}>
                      装依赖
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void action(p, 'start')} disabled={!canWrite || busy}>
                      启动
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void action(p, 'restart')} disabled={!canWrite || busy}>
                      重启
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void action(p, 'stop')} disabled={!canWrite || busy}>
                      停止
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void remove(p)}
                      disabled={!isAdmin || busy}
                      title={isAdmin ? undefined : '需要 admin 角色'}
                    >
                      删除
                    </Button>
                  </div>
                </div>

                {openId === p.id && (
                  <div className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface-2 p-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted">状态</span>
                      <pre className="overflow-auto rounded-(--radius-card) bg-bg p-3 font-[family-name:var(--font-mono)] text-xs text-text whitespace-pre-wrap">
                        {status.trim() || '无状态输出'}
                      </pre>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted">日志</span>
                      <Button size="sm" variant="ghost" onClick={() => void loadLogs(p.id)}>
                        刷新
                      </Button>
                    </div>
                    <pre className="max-h-72 overflow-auto rounded-(--radius-card) bg-bg p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
                      {logs.trim() || '无日志输出'}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}
