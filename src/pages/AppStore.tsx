import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Spinner'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

type ParamType = 'port' | 'password' | 'text' | 'path' | 'select'

interface ParamDef {
  key: string
  label: string
  type: ParamType
  default: string
  required: boolean
  options?: string[]
}

interface App {
  id: string
  name: string
  description: string
  icon: string
  version: string
  category: string
  params: ParamDef[]
}

interface Instance {
  id: number
  app_id: string
  name: string
  params: Record<string, string>
  status: string
  project_dir: string
  created_at: number
  updated_at: number
}

function statusBadge(status: string): 'online' | 'crit' | 'neutral' {
  if (status === 'running') return 'online'
  if (status === 'stopped') return 'crit'
  return 'neutral'
}

function InstallModal({ app, onClose, onInstalled }: {
  app: App
  onClose: () => void
  onInstalled: () => void
}) {
  const [name, setName] = useState('')
  const [params, setParams] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const p of app.params) init[p.key] = p.default
    return init
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const missing = app.params.some((p) => p.required && !params[p.key]?.trim())

  async function install() {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/appstore/install', {
        method: 'POST',
        body: JSON.stringify({ app_id: app.id, name: name.trim(), params }),
      })
      onInstalled()
      onClose()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`安装 ${app.name}`} onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">{app.description}</p>
        <Input label="实例名(可选,留空自动生成)" value={name} spellCheck={false}
          placeholder={app.id} onChange={(e) => setName(e.target.value)} />
        {app.params.map((p) =>
          p.type === 'select' ? (
            <label key={p.key} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">{p.label}{p.required ? ' *' : ''}</span>
              <select
                value={params[p.key] ?? ''}
                onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.value }))}
                className="h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {(p.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ) : (
            <Input
              key={p.key}
              label={`${p.label}${p.required ? ' *' : ''}`}
              type={p.type === 'password' ? 'password' : 'text'}
              inputMode={p.type === 'port' ? 'numeric' : undefined}
              spellCheck={false}
              value={params[p.key] ?? ''}
              onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.value }))}
            />
          ),
        )}
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center gap-2">
          <Button onClick={() => void install()} disabled={busy || missing}>安装</Button>
          {busy && <Spinner size={16} />}
        </div>
      </div>
    </Modal>
  )
}

function Catalog({ canInstall, onPick }: { canInstall: boolean; onPick: (app: App) => void }) {
  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const data = await apiFetch<App[]>('/api/m/appstore/apps')
        if (active) setApps(data)
      } catch (e) {
        if (active) setError(errorText(e))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  if (loading) return <Card className="flex h-32 items-center justify-center"><Spinner size={24} /></Card>
  if (error) return <Card><p className="text-sm text-muted">{error}</p></Card>

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {apps.map((app) => (
        <Card key={app.id} hoverable className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--radius-card) bg-surface-2 font-[family-name:var(--font-mono)] text-sm font-medium uppercase text-muted">
              {app.name.slice(0, 2)}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-text">{app.name}</span>
              <span className="text-xs text-muted">{app.category} · v{app.version}</span>
            </div>
          </div>
          <p className="min-h-8 text-xs leading-relaxed text-muted">{app.description}</p>
          <Button size="sm" onClick={() => onPick(app)} disabled={!canInstall}>安装</Button>
        </Card>
      ))}
    </div>
  )
}

function Instances({ isOperator, isAdmin, refreshKey }: { isOperator: boolean; isAdmin: boolean; refreshKey: number }) {
  const [insts, setInsts] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      setInsts(await apiFetch<Instance[]>('/api/m/appstore/instances'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function toggle(inst: Instance, verb: 'start' | 'stop') {
    setBusy(true)
    setFb(null)
    try {
      await apiFetch(`/api/m/appstore/instances/${inst.id}/${verb}`, { method: 'POST' })
      setFb({ kind: 'ok', text: `已对 ${inst.name} 执行 ${verb}` })
      await load()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function uninstall(inst: Instance) {
    if (!window.confirm(`确认卸载实例「${inst.name}」?容器将被移除(数据卷保留)。`)) return
    setBusy(true)
    setFb(null)
    try {
      await apiFetch(`/api/m/appstore/instances/${inst.id}`, { method: 'DELETE', headers: DANGER })
      setFb({ kind: 'ok', text: `${inst.name} 已卸载` })
      await load()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">已安装实例</h3>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading || busy}>刷新</Button>
      </div>
      {fb && <p className={`text-sm ${fb.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{fb.text}</p>}
      {loading ? (
        <div className="flex h-24 items-center justify-center"><Spinner size={20} /></div>
      ) : error ? (
        <p className="text-sm text-muted">{error}</p>
      ) : insts.length === 0 ? (
        <p className="text-sm text-muted">暂无已安装实例。</p>
      ) : (
        <div className="divide-y divide-border rounded-(--radius-card) border border-border">
          {insts.map((inst) => (
            <div key={inst.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-text">{inst.name}</span>
                <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{inst.app_id} · {inst.project_dir}</span>
              </div>
              <Badge status={statusBadge(inst.status)}>{inst.status}</Badge>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => void toggle(inst, 'start')} disabled={!isOperator || busy}>启动</Button>
                <Button size="sm" variant="ghost" onClick={() => void toggle(inst, 'stop')} disabled={!isOperator || busy}>停止</Button>
                <Button size="sm" variant="danger" onClick={() => void uninstall(inst)} disabled={!isAdmin || busy}>卸载</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!isOperator && <p className="text-xs text-muted">启停需要 operator 角色;安装与卸载需要 admin。</p>}
    </Card>
  )
}

/** AppStore 应用商店:应用目录卡片网格、参数表单安装、已装实例启停与卸载。 */
export default function AppStore() {
  const { role } = useAuth()
  const isOperator = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'
  const [picked, setPicked] = useState<App | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">应用目录</h2>
        <Catalog canInstall={isAdmin} onPick={setPicked} />
      </section>

      <Instances isOperator={isOperator} isAdmin={isAdmin} refreshKey={refreshKey} />

      {picked && (
        <InstallModal
          app={picked}
          onClose={() => setPicked(null)}
          onInstalled={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
