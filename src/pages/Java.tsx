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

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

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

const emptyCreate: CreateForm = {
  name: '',
  type: 'jar',
  artifact_path: '',
  java_version: '',
  jvm_args: '',
  port: '',
}

/** Java 项目:列表/创建(admin)/启停重启(operator+)/日志/删除/设置。 */
export default function Java() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const isWriter = isAdmin || role === 'operator'

  const [projects, setProjects] = useState<Project[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState<CreateForm>(emptyCreate)
  const [logFor, setLogFor] = useState<number | null>(null)
  const [logText, setLogText] = useState('')

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [p, v] = await Promise.all([
        apiFetch<Project[]>('/api/m/java/projects'),
        apiFetch<string[]>('/api/m/java/versions'),
      ])
      setProjects(p)
      setVersions(v)
      // 设置只在 admin 下取(后端 GET /settings 对任意角色开放,但展示与编辑限 admin)。
      if (isAdmin) {
        setSettings(await apiFetch<Settings>('/api/m/java/settings'))
      }
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const name = form.name.trim()
  const portNum = Number(form.port)
  const canCreate =
    isAdmin &&
    !busy &&
    name.length > 0 &&
    form.artifact_path.trim().length > 0 &&
    Number.isInteger(portNum) &&
    portNum >= 1 &&
    portNum <= 65535

  async function create() {
    if (!canCreate) return
    setBusy(true)
    setFeedback(null)
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
      setFeedback({ kind: 'ok', text: `项目 ${name} 已创建` })
      setForm(emptyCreate)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function action(p: Project, verb: 'start' | 'stop' | 'restart') {
    if (!isWriter) return
    if (verb === 'stop' && !window.confirm(`确认停止项目 ${p.name}?`)) return
    setFeedback(null)
    try {
      await apiFetch(`/api/m/java/projects/${p.id}/${verb}`, {
        method: 'POST',
        headers: verb === 'stop' ? DANGER : undefined,
      })
      setFeedback({ kind: 'ok', text: `项目 ${p.name} ${verb} 完成` })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function remove(p: Project) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除项目 ${p.name}?此操作危险且不可恢复。`)) return
    setFeedback(null)
    try {
      await apiFetch(`/api/m/java/projects/${p.id}`, { method: 'DELETE', headers: DANGER })
      if (logFor === p.id) setLogFor(null)
      setFeedback({ kind: 'ok', text: `项目 ${p.name} 已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function showLogs(p: Project) {
    if (logFor === p.id) {
      setLogFor(null)
      return
    }
    setLogFor(p.id)
    setLogText('加载中…')
    try {
      const text = await apiFetch<string>(`/api/m/java/projects/${p.id}/logs?tail=200`)
      setLogText(text || '(空)')
    } catch (e) {
      setLogText(errorText(e))
    }
  }

  async function saveSettings() {
    if (!settings || busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<Settings>('/api/m/java/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setSettings(res)
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function setS<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s))
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">创建项目</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="项目名"
            placeholder="例如 demo-api"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={form.name}
            disabled={!isAdmin}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">部署类型</span>
            <select
              className={fieldClass}
              value={form.type}
              disabled={!isAdmin}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="jar">jar(独立进程)</option>
              <option value="war">war(独立进程)</option>
              <option value="tomcat">tomcat(部署到 Tomcat)</option>
            </select>
          </label>
        </div>
        <Input
          label="构件路径 (artifact_path)"
          placeholder="基目录内相对/绝对路径,如 demo/app.jar"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          value={form.artifact_path}
          disabled={!isAdmin}
          onChange={(e) => setForm((f) => ({ ...f, artifact_path: e.target.value }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">JDK 版本</span>
            <select
              className={fieldClass}
              value={form.java_version}
              disabled={!isAdmin}
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
            disabled={!isAdmin}
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
          disabled={!isAdmin}
          onChange={(e) => setForm((f) => ({ ...f, jvm_args: e.target.value }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void create()} disabled={!canCreate}>
            创建
          </Button>
          {busy && <Spinner size={16} />}
        </div>
        {!isAdmin && (
          <p className="text-xs text-muted">创建项目需要 admin 角色(可定义任意进程命令,属提权操作)。</p>
        )}
        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">项目列表</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && projects.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">{loadErr}</p>
        ) : projects.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">暂无 Java 项目。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {projects.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 px-5 py-3.5">
                <div className="flex items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{p.name}</span>
                      <Badge status="neutral">{p.type}</Badge>
                      <Badge status="neutral">:{p.port}</Badge>
                    </div>
                    <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                      {p.artifact_path}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void action(p, 'start')}
                      disabled={!isWriter}
                    >
                      启动
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void action(p, 'restart')}
                      disabled={!isWriter}
                    >
                      重启
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void action(p, 'stop')}
                      disabled={!isWriter}
                    >
                      停止
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void showLogs(p)}>
                      日志
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void remove(p)}
                      disabled={!isAdmin}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                {logFor === p.id && (
                  <pre className="max-h-72 overflow-auto rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-muted">
                    {logText}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {isAdmin && settings && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">设置(路径)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['base_dir', '项目根基目录 (base_dir)'],
                ['jdk_dir', 'JDK bin 目录 (jdk_dir)'],
                ['tomcat_dir', 'Tomcat 目录 (tomcat_dir)'],
                ['conf_dir', '进程配置目录 (conf_dir)'],
                ['log_dir', '日志目录 (log_dir)'],
              ] as const
            ).map(([key, label]) => (
              <Input
                key={key}
                label={label}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="font-[family-name:var(--font-mono)]"
                value={settings[key]}
                onChange={(e) => setS(key, e.target.value)}
              />
            ))}
          </div>
          <div>
            <Button onClick={() => void saveSettings()} disabled={busy}>
              保存设置
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
