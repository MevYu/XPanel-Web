import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Spinner'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Segmented } from '../components/Segmented'
import { Search, Boxes, Database, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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

function statusLabel(status: string): string {
  if (status === 'running') return '运行中'
  if (status === 'stopped') return '已停止'
  return status
}

// 分类 → 暖色 token + 图标,给应用卡片着色,视觉友好且语义一致。
const categoryAccent: Record<string, { color: string; soft: string; icon: LucideIcon }> = {
  数据库: { color: 'var(--color-brand)', soft: 'var(--color-brand-soft)', icon: Database },
  工具: { color: 'var(--color-warn)', soft: 'var(--color-warn-soft)', icon: Wrench },
}
const defaultAccent = { color: 'var(--color-online)', soft: 'var(--color-online-soft)', icon: Boxes }

function accentFor(category: string) {
  return categoryAccent[category] ?? defaultAccent
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
        <p className="text-xs leading-relaxed text-muted">{app.description}</p>
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

function ManageModal({ inst, isOperator, onClose, onChanged }: {
  inst: Instance
  isOperator: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [status, setStatus] = useState(inst.status)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function toggle(verb: 'start' | 'stop') {
    setBusy(true)
    setErr(null)
    try {
      const updated = await apiFetch<Instance>(`/api/m/appstore/instances/${inst.id}/${verb}`, { method: 'POST' })
      setStatus(updated.status)
      onChanged()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`管理 ${inst.name}`} onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">应用</dt>
            <dd className="font-[family-name:var(--font-mono)] text-text">{inst.app_id}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">状态</dt>
            <dd><Badge status={statusBadge(status)}>{statusLabel(status)}</Badge></dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">目录</dt>
            <dd className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{inst.project_dir}</dd>
          </div>
        </dl>
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button size="sm" variant="ghost" onClick={() => void toggle('start')} disabled={!isOperator || busy || status === 'running'}>启动</Button>
          <Button size="sm" variant="ghost" onClick={() => void toggle('stop')} disabled={!isOperator || busy || status === 'stopped'}>停止</Button>
          {busy && <Spinner size={16} />}
        </div>
        {!isOperator && <p className="text-xs text-muted">启停需要 operator 角色。</p>}
      </div>
    </Modal>
  )
}

const ALL = '全部'

function Catalog({ apps, canInstall, onPick }: { apps: App[]; canInstall: boolean; onPick: (app: App) => void }) {
  if (apps.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-1 py-10">
        <span className="text-sm font-medium text-text">没有匹配的应用</span>
        <span className="text-xs text-muted">换个关键词或分类试试。</span>
      </Card>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {apps.map((app) => {
        const accent = accentFor(app.category)
        const Icon = accent.icon
        return (
          <Card key={app.id} hoverable className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-(--radius-card)"
                style={{ backgroundColor: accent.soft, color: accent.color }}
              >
                <Icon size={20} />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-text">{app.name}</span>
                <span className="text-xs text-muted">{app.category} · v{app.version}</span>
              </div>
            </div>
            <p className="min-h-8 text-xs leading-relaxed text-muted">{app.description}</p>
            <Button size="sm" onClick={() => onPick(app)} disabled={!canInstall}>安装</Button>
          </Card>
        )
      })}
    </div>
  )
}

function Instances({ isOperator, isAdmin, refreshKey }: { isOperator: boolean; isAdmin: boolean; refreshKey: number }) {
  const [insts, setInsts] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [manageId, setManageId] = useState<number | null>(null)

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

  const columns: Column<Instance>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '名称',
        cell: (inst) => (
          <button
            type="button"
            onClick={() => setManageId(inst.id)}
            className="inline-flex items-center gap-2 rounded-sm font-medium text-text outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <span className="truncate">{inst.name}</span>
          </button>
        ),
      },
      {
        key: 'app',
        header: '应用',
        cell: (inst) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{inst.app_id}</span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '110px',
        cell: (inst) => <Badge status={statusBadge(inst.status)}>{statusLabel(inst.status)}</Badge>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '140px',
        align: 'right',
        cell: (inst) => (
          <ActionLinks>
            <ActionLink onClick={() => setManageId(inst.id)}>管理</ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin || busy}
              aria-label="卸载实例"
              title={isAdmin ? '卸载实例' : '需要 admin 角色'}
              onClick={() => void uninstall(inst)}
            >
              卸载
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, busy],
  )

  const manageInst = manageId == null ? null : (insts.find((i) => i.id === manageId) ?? null)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text">已安装实例</h2>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading || busy}>刷新</Button>
      </div>
      {fb && <p className={`text-sm ${fb.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{fb.text}</p>}
      {loading ? (
        <div className="h-32 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : error ? (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {error}
          <Button size="sm" variant="ghost" onClick={() => void load()}>重试</Button>
        </p>
      ) : (
        <Table
          columns={columns}
          rows={insts}
          rowKey={(inst) => inst.id}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">还没有已安装实例</span>
              <span className="text-xs text-muted">从上方应用目录选一个安装。</span>
            </span>
          }
        />
      )}
      {!isOperator && <p className="text-xs text-muted">启停需要 operator 角色;安装与卸载需要 admin。</p>}

      {manageInst && (
        <ManageModal
          inst={manageInst}
          isOperator={isOperator}
          onClose={() => setManageId(null)}
          onChanged={() => void load()}
        />
      )}
    </section>
  )
}

/** AppStore 应用商店:应用目录卡片网格(分类筛选 + 搜索)、固定尺寸安装弹窗、已装实例紧凑表(管理｜卸载)。 */
export default function AppStore() {
  const { role } = useAuth()
  const isOperator = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'
  const [picked, setPicked] = useState<App | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL)

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

  const categories = useMemo(() => {
    const seen: string[] = []
    for (const a of apps) if (!seen.includes(a.category)) seen.push(a.category)
    return [ALL, ...seen]
  }, [apps])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter((a) => {
      if (category !== ALL && a.category !== category) return false
      if (!q) return true
      return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    })
  }, [apps, query, category])

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            items={categories.map((c) => ({ key: c, label: c }))}
            active={category}
            onChange={setCategory}
          />
          <div className="relative w-56">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索应用名或描述"
              spellCheck={false}
              className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            />
          </div>
        </div>

        {loading ? (
          <Card className="flex h-32 items-center justify-center"><Spinner size={24} /></Card>
        ) : error ? (
          <Card><p className="text-sm text-muted">{error}</p></Card>
        ) : (
          <Catalog apps={visible} canInstall={isAdmin} onPick={setPicked} />
        )}
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
