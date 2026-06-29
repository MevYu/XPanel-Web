import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { usePoll } from '../hooks/usePoll'
import { formatTime } from '../lib/formatTime'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { TabModal, type ModalTab } from '../components/TabModal'
import { Spinner } from '../components/Spinner'
import { IconButton } from '../components/IconButton'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Tabs } from '../components/Tabs'
import { EmptyState } from '../components/EmptyState'
import { Search, Boxes, Database, Wrench, PackageSearch, ChevronLeft, ChevronRight, Info, Activity, ScrollText, Settings2 } from 'lucide-react'
import { SettingsModal } from '../components/SettingsModal'
import type { LucideIcon } from 'lucide-react'

const PAGE_SIZES = [10, 20, 50] as const

/** Pager 列表/表格底部分页条:共计、每页条数、上一页/下一页,对齐 Sites/Database。 */
function Pager({
  total,
  page,
  pageCount,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number
  page: number
  pageCount: number
  pageSize: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
      <span className="tabular-nums">共 {total} 条</span>
      <select
        value={pageSize}
        onChange={(e) => onPageSize(Number(e.target.value))}
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
          onClick={() => onPage(Math.max(0, page - 1))}
        />
        <span className="tabular-nums px-1">
          {page + 1} / {pageCount}
        </span>
        <IconButton
          aria-label="下一页"
          className="h-8 w-8"
          disabled={page >= pageCount - 1}
          icon={<ChevronRight size={16} />}
          onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
        />
      </div>
    </div>
  )
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

// status/logs 端点返回 text/plain(compose ps / logs 原文),不能走强制 JSON 的 apiFetch,用裸 fetch 自带 Bearer。
async function fetchText(path: string): Promise<string> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).trim()}`)
  return res.text()
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

type InstanceTabKey = 'detail' | 'status' | 'logs'

const INSTANCE_TABS: ModalTab<InstanceTabKey>[] = [
  { key: 'detail', label: '详情', Icon: Info },
  { key: 'status', label: '状态', Icon: Activity },
  { key: 'logs', label: '日志', Icon: ScrollText },
]

// DetailTab 实例详情:拉 GET /instances/{id} 取完整记录(状态/目录/时间戳)并提供启停。
// 安装参数含明文密码(后端不脱敏),按"凭证不回显"约定不在此渲染。
function DetailTab({ inst, isOperator, onChanged }: {
  inst: Instance
  isOperator: boolean
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<Instance | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setDetail(await apiFetch<Instance>(`/api/m/appstore/instances/${inst.id}`))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [inst.id])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(verb: 'start' | 'stop') {
    setBusy(true)
    setErr(null)
    try {
      const updated = await apiFetch<Instance>(`/api/m/appstore/instances/${inst.id}/${verb}`, { method: 'POST' })
      setDetail(updated)
      onChanged()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !detail) return <div className="flex h-32 items-center justify-center"><Spinner size={24} /></div>
  if (!detail) return <p className="text-sm text-crit">{err ?? '加载失败'}</p>

  const running = detail.status === 'running'
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-2.5 text-sm">
        <dt className="text-muted">应用</dt>
        <dd className="font-[family-name:var(--font-mono)] text-text">{detail.app_id}</dd>
        <dt className="text-muted">状态</dt>
        <dd><Badge status={statusBadge(detail.status)}>{statusLabel(detail.status)}</Badge></dd>
        <dt className="text-muted">目录</dt>
        <dd className="break-all font-[family-name:var(--font-mono)] text-xs text-muted">{detail.project_dir}</dd>
        <dt className="text-muted">创建于</dt>
        <dd className="tabular-nums text-muted">{formatTime(detail.created_at)}</dd>
        <dt className="text-muted">更新于</dt>
        <dd className="tabular-nums text-muted">{formatTime(detail.updated_at)}</dd>
      </dl>
      {err && <p className="text-sm text-crit">{err}</p>}
      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Button size="sm" variant="ghost" onClick={() => void toggle('start')} disabled={!isOperator || busy || running}>启动</Button>
        <Button size="sm" variant="ghost" onClick={() => void toggle('stop')} disabled={!isOperator || busy || !running}>停止</Button>
        {busy && <Spinner size={16} />}
      </div>
      {!isOperator && <p className="text-xs text-muted">启停需要 operator 角色。</p>}
    </div>
  )
}

// StatusTab 运行状态:轮询 compose ps 文本(text/plain)5s 一次;仅该 tab 激活时挂载,卸载即停轮询。
function StatusTab({ id }: { id: number }) {
  const fetcher = useCallback(() => fetchText(`/api/m/appstore/instances/${id}/status`), [id])
  const { data, error, loading } = usePoll(fetcher, 5000)

  if (loading && data == null) return <div className="flex h-32 items-center justify-center"><Spinner size={24} /></div>
  if (error && data == null) return <p className="text-sm text-crit">{errorText(error)}</p>
  return (
    <pre className="h-full overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre">
      {(data ?? '').trim() || '无运行容器'}
    </pre>
  )
}

// LogsTab 实例日志:拉 compose logs 尾部 200 行(text/plain),手动刷新。
function LogsTab({ id }: { id: number }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setContent(await fetchText(`/api/m/appstore/instances/${id}/logs?tail=200`))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">最近 200 行</span>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>刷新</Button>
      </div>
      {err ? (
        <p className="text-sm text-crit">{err}</p>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center"><Spinner size={24} /></div>
      ) : (
        <pre className="flex-1 overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
          {content.trim() || '暂无日志'}
        </pre>
      )}
    </div>
  )
}

// ManageModal 实例详情/状态/日志:左竖 tab 弹窗(对齐 SiteDrawer)。详情拉 GET /instances/{id} 并启停,状态轮询 compose ps,日志读 compose logs。
function ManageModal({ inst, isOperator, onClose, onChanged }: {
  inst: Instance
  isOperator: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [tab, setTab] = useState<InstanceTabKey>('detail')
  return (
    <TabModal
      title={inst.name}
      subtitle={
        <>
          <Badge status="neutral">{inst.app_id}</Badge>
          <Badge status={statusBadge(inst.status)}>{statusLabel(inst.status)}</Badge>
        </>
      }
      tabs={INSTANCE_TABS}
      active={tab}
      onTab={setTab}
      onClose={onClose}
    >
      {tab === 'detail' && <DetailTab inst={inst} isOperator={isOperator} onChanged={onChanged} />}
      {tab === 'status' && <StatusTab id={inst.id} />}
      {tab === 'logs' && <LogsTab id={inst.id} />}
    </TabModal>
  )
}

const ALL = '全部'
const INSTALLED = '已安装'

// aaPanel 风格紧凑应用行:小图标 + 名称/简介 + 版本 + 安装按钮,密度高、单行 56px 量级;应用多时底部分页。
function Catalog({ apps, canInstall, onPick }: { apps: App[]; canInstall: boolean; onPick: (app: App) => void }) {
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

  const total = apps.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  // 搜索/分类收窄或换每页条数时,把当前页夹回有效范围,避免停在空页。
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  const pageApps = useMemo(
    () => apps.slice(page * pageSize, page * pageSize + pageSize),
    [apps, page, pageSize],
  )

  if (apps.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState icon={<PackageSearch />} title="没有匹配的应用" hint="换个关键词或分类试试。" />
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-border">
          {pageApps.map((app) => {
            const accent = accentFor(app.category)
            const Icon = accent.icon
            return (
              <li
                key={app.id}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors row-hover sm:px-4"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-sm)"
                  style={{ backgroundColor: accent.soft, color: accent.color }}
                >
                  <Icon size={18} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-text">{app.name}</span>
                    <span className="shrink-0 font-[family-name:var(--font-mono)] text-xs text-faint">v{app.version}</span>
                  </div>
                  <span className="truncate text-xs text-muted">{app.description}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onPick(app)} disabled={!canInstall}>安装</Button>
              </li>
            )
          })}
        </ul>
      </Card>
      {total > 0 && (
        <Pager
          total={total}
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n)
            setPage(0)
          }}
        />
      )}
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
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

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

  // 行内启停:复用实例 start/stop 端点,乐观回填返回状态,避免仅能进管理弹窗操作。
  async function toggle(inst: Instance) {
    if (!isOperator || togglingId != null) return
    const verb = inst.status === 'running' ? 'stop' : 'start'
    if (verb === 'stop' && !window.confirm(`确认停止实例「${inst.name}」?`)) return
    setTogglingId(inst.id)
    setFb(null)
    try {
      const updated = await apiFetch<Instance>(`/api/m/appstore/instances/${inst.id}/${verb}`, { method: 'POST' })
      setInsts((prev) => prev.map((i) => (i.id === inst.id ? updated : i)))
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setTogglingId(null)
    }
  }

  const total = insts.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  const pageRows = useMemo(
    () => insts.slice(page * pageSize, page * pageSize + pageSize),
    [insts, page, pageSize],
  )

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
        width: '200px',
        align: 'right',
        cell: (inst) => {
          const running = inst.status === 'running'
          return (
            <ActionLinks>
              <ActionLink
                disabled={!isOperator || togglingId === inst.id}
                aria-label={running ? '停止实例' : '启动实例'}
                title={isOperator ? (running ? '停止实例' : '启动实例') : '需要 operator 角色'}
                onClick={() => void toggle(inst)}
              >
                {running ? '停止' : '启动'}
              </ActionLink>
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
          )
        },
      },
    ],
    [isAdmin, isOperator, busy, togglingId],
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
        <>
          <Table
            columns={columns}
            rows={pageRows}
            rowKey={(inst) => inst.id}
            emptyText={
              <span className="flex flex-col items-center gap-1 py-6">
                <span className="text-sm font-medium text-text">还没有已安装实例</span>
                <span className="text-xs text-muted">从上方应用目录选一个安装。</span>
              </span>
            }
          />
          {total > 0 && (
            <Pager
              total={total}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(n) => {
                setPageSize(n)
                setPage(0)
              }}
            />
          )}
        </>
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

interface AppStoreSettings {
  apps_root: string
  project_dir: string
}

/** AppStore 应用商店:对齐 aaPanel —— 顶部分类 tab(全部/已安装/各分类)+ 搜索,主体为紧凑应用列表;已安装 tab 切到实例表(管理｜卸载),固定尺寸安装弹窗。 */
export default function AppStore() {
  const { role } = useAuth()
  const isOperator = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'
  const [picked, setPicked] = useState<App | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  // 分类 tab:全部 + 已安装(实例视图)+ 各应用分类,对齐 aaPanel 顶部分类条。
  const tabs = useMemo(() => {
    const seen: string[] = []
    for (const a of apps) if (!seen.includes(a.category)) seen.push(a.category)
    return [
      { key: ALL, label: ALL },
      { key: INSTALLED, label: INSTALLED },
      ...seen.map((c) => ({ key: c, label: c })),
    ]
  }, [apps])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter((a) => {
      if (category !== ALL && category !== INSTALLED && a.category !== category) return false
      if (!q) return true
      return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    })
  }, [apps, query, category])

  const onInstalled = category === INSTALLED

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={tabs} active={category} onChange={setCategory} className="flex-1" />
        <div className="flex items-center gap-2 pb-2">
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
              className="h-9 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            />
          </div>
          <Button variant="ghost" size="md" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} />
            设置
          </Button>
        </div>
      </div>

      {onInstalled ? (
        <Instances isOperator={isOperator} isAdmin={isAdmin} refreshKey={refreshKey} />
      ) : loading ? (
        <Card className="flex h-32 items-center justify-center"><Spinner size={24} /></Card>
      ) : error ? (
        <Card><p className="text-sm text-muted">{error}</p></Card>
      ) : (
        <Catalog apps={visible} canInstall={isAdmin} onPick={setPicked} />
      )}

      {picked && (
        <InstallModal
          app={picked}
          onClose={() => setPicked(null)}
          onInstalled={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {settingsOpen && (
        <SettingsModal<AppStoreSettings>
          title="应用商店设置"
          endpoint="/api/m/appstore/settings"
          isAdmin={isAdmin}
          onClose={() => setSettingsOpen(false)}
        >
          {(form, set, disabled) => (
            <>
              <Input
                label="应用数据根目录 apps_root"
                value={form.apps_root}
                disabled={disabled}
                spellCheck={false}
                className="font-[family-name:var(--font-mono)]"
                onChange={(e) => set('apps_root', e.target.value)}
              />
              <Input
                label="compose 项目目录 project_dir"
                value={form.project_dir}
                disabled={disabled}
                spellCheck={false}
                className="font-[family-name:var(--font-mono)]"
                onChange={(e) => set('project_dir', e.target.value)}
              />
            </>
          )}
        </SettingsModal>
      )}
    </div>
  )
}
