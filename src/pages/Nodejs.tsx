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

/** Nodejs:列出项目,创建(目录/命令/端口/版本),启停/重启,查看状态与日志,模块设置。 */
export default function Nodejs() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [projects, setProjects] = useState<Project[]>([])
  const [nodeVersions, setNodeVersions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState<CreateForm>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [openId, setOpenId] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [logs, setLogs] = useState('')
  const [stream, setStream] = useState<'stdout' | 'stderr'>('stdout')

  const [settings, setSettings] = useState<NodeSettings>(emptySettings)
  const [showSettings, setShowSettings] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [ps, vs] = await Promise.all([
        apiFetch<Project[]>('/api/m/nodejs/projects'),
        apiFetch<string[]>('/api/m/nodejs/versions').catch(() => [] as string[]),
      ])
      setProjects(ps)
      setNodeVersions(vs ?? [])
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

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
    canWrite

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
      if (openId === p.id) setStatus(typeof res === 'string' ? res : '')
      else await refreshStatus(p.id)
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
      const s = await apiFetch<string>(`/api/m/nodejs/projects/${id}/status`)
      setStatus(typeof s === 'string' ? s : '')
    } catch (e) {
      setStatus(errorText(e))
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

  async function open(p: Project) {
    if (openId === p.id) {
      setOpenId(null)
      return
    }
    setOpenId(p.id)
    setStatus('')
    setLogs('')
    setStream('stdout')
    await Promise.all([refreshStatus(p.id), loadLogs(p.id, 'stdout')])
  }

  function switchStream(id: number, which: 'stdout' | 'stderr') {
    setStream(which)
    void loadLogs(id, which)
  }

  async function openSettings() {
    if (showSettings) {
      setShowSettings(false)
      return
    }
    setShowSettings(true)
    try {
      const s = await apiFetch<NodeSettings>('/api/m/nodejs/settings')
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
      await apiFetch('/api/m/nodejs/settings', { method: 'PUT', body: JSON.stringify(settings) })
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
            label="目录"
            placeholder="相对 base_dir 或绝对路径"
            value={form.directory}
            spellCheck={false}
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void create()} disabled={!canSubmit}>
            创建
          </Button>
          {busy && <Spinner size={16} />}
        </div>
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
                      <Badge status="neutral">:{p.port}</Badge>
                      {p.node_version && <Badge status="neutral">{p.node_version}</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-[family-name:var(--font-mono)] text-xs text-muted">
                      <span className="truncate">{p.directory}</span>
                      <span className="truncate">{p.command}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => void open(p)}>
                      {openId === p.id ? '收起' : '详情'}
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
                      <Button
                        size="sm"
                        variant={stream === 'stdout' ? 'primary' : 'ghost'}
                        onClick={() => switchStream(p.id, 'stdout')}
                      >
                        stdout
                      </Button>
                      <Button
                        size="sm"
                        variant={stream === 'stderr' ? 'primary' : 'ghost'}
                        onClick={() => switchStream(p.id, 'stderr')}
                      >
                        stderr
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void loadLogs(p.id, stream)}>
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
