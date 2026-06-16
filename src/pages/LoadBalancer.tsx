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

interface Backend {
  host: string
  port: number
  weight: number
  max_fails: number
  fail_timeout: string
}

interface Group {
  id: number
  name: string
  algo: string
  listen: number
  server_name: string
  backends: Backend[]
  enabled: boolean
  config: string
}

interface Settings {
  conf_dir: string
}

const ALGOS = ['round-robin', 'least_conn', 'ip_hash']

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

interface CreateForm {
  name: string
  algo: string
  listen: string
  server_name: string
  backends: string // 每行 host:port:weight
}

const emptyForm: CreateForm = {
  name: '',
  algo: 'round-robin',
  listen: '80',
  server_name: '',
  backends: '',
}

// parseBackends 把多行 host:port[:weight] 文本解析为后端数组,非法行抛错。
function parseBackends(text: string): Backend[] {
  const out: Backend[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(':')
    if (parts.length < 2) throw new Error(`后端格式错误: ${line}(应为 host:port:weight)`)
    const host = parts[0].trim()
    const port = Number(parts[1])
    const weight = parts[2] !== undefined && parts[2] !== '' ? Number(parts[2]) : 1
    if (!host || !Number.isInteger(port) || port <= 0) throw new Error(`后端格式错误: ${line}`)
    if (!Number.isInteger(weight) || weight <= 0) throw new Error(`权重错误: ${line}`)
    out.push({ host, port, weight, max_fails: 0, fail_timeout: '' })
  }
  if (out.length === 0) throw new Error('至少需要一个后端节点')
  return out
}

/** 负载均衡:管理 nginx upstream 均衡组(列表、创建、启停、删除、查看生成配置)与设置。 */
export default function LoadBalancer() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [groups, setGroups] = useState<Group[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState<CreateForm>(emptyForm)
  const [configOf, setConfigOf] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [g, s] = await Promise.all([
        apiFetch<Group[]>('/api/m/loadbalancer/groups'),
        apiFetch<Settings>('/api/m/loadbalancer/settings'),
      ])
      setGroups(g)
      setSettings(s)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function create() {
    if (busy || !canWrite) return
    let backends: Backend[]
    try {
      backends = parseBackends(form.backends)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/loadbalancer/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          algo: form.algo,
          listen: Number(form.listen) || 80,
          server_name: form.server_name.trim(),
          backends,
        }),
      })
      setFeedback({ kind: 'ok', text: `均衡组 ${form.name.trim()} 已创建` })
      setForm(emptyForm)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function toggle(g: Group, enable: boolean) {
    if (busy) return
    if (!enable && !window.confirm(`确认停用均衡组 ${g.name}?该组将下线。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/loadbalancer/groups/${g.id}/${enable ? 'enable' : 'disable'}`, {
        method: 'POST',
        headers: enable ? undefined : DANGER,
      })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(g: Group) {
    if (busy || !isAdmin) return
    if (!window.confirm(`确认删除均衡组 ${g.name}?此操作危险且不可恢复。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/loadbalancer/groups/${g.id}`, { method: 'DELETE', headers: DANGER })
      if (configOf === g.id) setConfigOf(null)
      setFeedback({ kind: 'ok', text: `均衡组 ${g.name} 已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings() {
    if (!settings || busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<Settings>('/api/m/loadbalancer/settings', {
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {loadErr && <p className="text-sm text-crit">{loadErr}</p>}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">创建均衡组</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="名称"
            placeholder="例如 web-cluster"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">算法</span>
            <select
              className={fieldClass}
              value={form.algo}
              onChange={(e) => setForm((f) => ({ ...f, algo: e.target.value }))}
            >
              {ALGOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="监听端口"
            type="number"
            min={1}
            value={form.listen}
            onChange={(e) => setForm((f) => ({ ...f, listen: e.target.value }))}
          />
          <Input
            label="server_name"
            placeholder="例如 lb.example.com"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={form.server_name}
            onChange={(e) => setForm((f) => ({ ...f, server_name: e.target.value }))}
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">后端节点(每行 host:port:weight)</span>
          <textarea
            className={`min-h-28 rounded-(--radius-card) border border-border bg-surface-2 px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg`}
            placeholder={'10.0.0.1:8080:3\n10.0.0.2:8080:1'}
            spellCheck={false}
            value={form.backends}
            onChange={(e) => setForm((f) => ({ ...f, backends: e.target.value }))}
          />
        </label>
        <div>
          <Button
            onClick={() => void create()}
            disabled={busy || !canWrite || form.name.trim().length === 0}
          >
            创建
          </Button>
        </div>
        {!canWrite && <p className="text-xs text-muted">创建均衡组需要 operator 或 admin 角色。</p>}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">均衡组列表</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
        </div>
        {groups.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">暂无均衡组。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-2 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{g.name}</span>
                      <Badge status="neutral">{g.algo}</Badge>
                      <Badge status={g.enabled ? 'online' : 'neutral'}>
                        {g.enabled ? '运行中' : '已停用'}
                      </Badge>
                    </div>
                    <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                      :{g.listen} {g.server_name} · {g.backends.length} 个后端
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfigOf(configOf === g.id ? null : g.id)}
                    >
                      {configOf === g.id ? '隐藏配置' : '查看配置'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void toggle(g, !g.enabled)}
                      disabled={busy || !canWrite}
                    >
                      {g.enabled ? '停用' : '启用'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void remove(g)}
                      disabled={busy || !isAdmin}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                {configOf === g.id && (
                  <pre className="overflow-x-auto rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-muted">
                    {g.config}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {settings && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">服务设置</h2>
          <Input
            label="nginx 配置目录 (conf_dir)"
            className="font-[family-name:var(--font-mono)]"
            spellCheck={false}
            value={settings.conf_dir}
            onChange={(e) => setSettings((s) => (s ? { ...s, conf_dir: e.target.value } : s))}
          />
          <div>
            <Button onClick={() => void saveSettings()} disabled={busy || !isAdmin}>
              保存设置
            </Button>
          </div>
          {!isAdmin && <p className="text-xs text-muted">修改设置需要 admin 角色。</p>}
        </Card>
      )}
    </div>
  )
}
