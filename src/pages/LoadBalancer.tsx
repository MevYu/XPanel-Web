import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Input } from '../components/Input'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { IconButton } from '../components/IconButton'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import {
  Plus,
  Settings2,
  Search,
  GitFork,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { uid } from '../lib/uid'

const PAGE_SIZES = [10, 20, 50] as const

/** Pager 表底分页条:共 N 条 + 每页条数 + 上/下页,对齐 Sites 列表。 */
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

interface BackendHealth {
  host: string
  port: number
  up: boolean
  response_ms: number
  error?: string
}

interface GroupHealth {
  group_id: number
  name: string
  backends: BackendHealth[]
}

const ALGOS = ['round-robin', 'least_conn', 'ip_hash']

const ALGO_LABEL: Record<string, string> = {
  'round-robin': '轮询',
  least_conn: '最少连接',
  ip_hash: 'IP 哈希',
}

const fieldClass =
  'h-10 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40'

/** 负载均衡:aaPanel 风格——工具栏(添加/设置)+ 紧凑均衡组表 + 固定尺寸创建/详情/设置弹窗。 */
export default function LoadBalancer() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [healthSummary, setHealthSummary] = useState<Record<number, { up: number; total: number }>>({})

  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setGroups(await apiFetch<Group[]>('/api/m/loadbalancer/groups'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 均衡组加载后,为已启用组逐个拉节点健康,汇总成「N/M 在线」供状态列展示。
  useEffect(() => {
    const enabled = groups.filter((g) => g.enabled)
    if (enabled.length === 0) return
    let alive = true
    void Promise.all(
      enabled.map(async (g) => {
        try {
          const h = await apiFetch<GroupHealth>(`/api/m/loadbalancer/groups/${g.id}/health`)
          return [g.id, { up: h.backends.filter((b) => b.up).length, total: h.backends.length }] as const
        } catch {
          return null
        }
      }),
    ).then((entries) => {
      if (!alive) return
      const next: Record<number, { up: number; total: number }> = {}
      for (const e of entries) if (e) next[e[0]] = e[1]
      setHealthSummary(next)
    })
    return () => {
      alive = false
    }
  }, [groups])

  async function toggle(g: Group, enable: boolean) {
    if (busy || !canWrite) return
    if (!enable && !window.confirm(`确认停用均衡组「${g.name}」?该组将下线。`)) return
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
    if (!window.confirm(`确认删除均衡组「${g.name}」?此操作危险且不可恢复。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/loadbalancer/groups/${g.id}`, { method: 'DELETE', headers: DANGER })
      if (detailId === g.id) setDetailId(null)
      setFeedback({ kind: 'ok', text: `均衡组 ${g.name} 已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(
      (g) => g.name.toLowerCase().includes(q) || g.server_name.toLowerCase().includes(q),
    )
  }, [groups, query])

  // 搜索或每页条数变化导致行数缩减时,把当前页夹回有效范围,避免停在空页。
  const total = visible.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  const pageRows = useMemo(
    () => visible.slice(page * pageSize, page * pageSize + pageSize),
    [visible, page, pageSize],
  )

  const detail = detailId == null ? null : (groups.find((g) => g.id === detailId) ?? null)

  const columns: Column<Group>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '名称',
        cell: (g) => (
          <button
            type="button"
            onClick={() => setDetailId(g.id)}
            className="inline-flex items-center gap-2 rounded-sm font-medium text-text outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <GitFork size={15} className="shrink-0 text-warn" />
            <span className="truncate">{g.name}</span>
          </button>
        ),
      },
      {
        key: 'server_name',
        header: '域名(端口)',
        cell: (g) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {g.server_name || '—'}
            <span className="text-text/60"> :{g.listen}</span>
          </span>
        ),
      },
      {
        key: 'algo',
        header: '调度策略',
        width: '110px',
        cell: (g) => <span className="text-muted">{ALGO_LABEL[g.algo] ?? g.algo}</span>,
      },
      {
        key: 'nodes',
        header: '节点数',
        width: '80px',
        cell: (g) => <span className="text-muted">{g.backends.length}</span>,
      },
      {
        key: 'status',
        header: '状态',
        width: '108px',
        cell: (g) => {
          if (!g.enabled) return <Badge status="neutral">已停用</Badge>
          const s = healthSummary[g.id]
          if (!s) return <Badge status="online">运行中</Badge>
          const allUp = s.total > 0 && s.up === s.total
          return (
            <Badge status={s.up === 0 && s.total > 0 ? 'crit' : allUp ? 'online' : 'warn'}>
              {s.up}/{s.total} 在线
            </Badge>
          )
        },
      },
      {
        key: 'actions',
        header: '操作',
        width: '170px',
        align: 'right',
        cell: (g) => (
          <ActionLinks>
            <ActionLink onClick={() => setDetailId(g.id)}>详情</ActionLink>
            <ActionLink
              disabled={!canWrite}
              title={canWrite ? undefined : '需要 operator 角色'}
              onClick={() => void toggle(g, !g.enabled)}
            >
              {g.enabled ? '停用' : '启用'}
            </ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin}
              aria-label="删除均衡组"
              title={isAdmin ? '删除均衡组' : '需要 admin 角色'}
              onClick={() => void remove(g)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, canWrite, busy, detailId, healthSummary],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="md" disabled={!canWrite} onClick={() => setCreating(true)}>
            <Plus size={15} />
            添加负载
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
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="搜索名称或域名"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
      </div>

      {loadErr && groups.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      {feedback && (
        <p
          className={`rounded-(--radius-card) border px-3 py-2 text-sm ${
            feedback.kind === 'ok'
              ? 'border-online/40 bg-online/10 text-online'
              : 'border-crit/40 bg-crit/10 text-crit'
          }`}
        >
          {feedback.text}
        </p>
      )}

      {loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : (
        <>
          <Table
            columns={columns}
            rows={pageRows}
            rowKey={(g) => g.id}
            emptyText={
              <EmptyState
                icon={<GitFork />}
                title={groups.length === 0 ? '还没有均衡组' : '没有匹配的均衡组'}
                hint={
                  groups.length === 0
                    ? '点击「添加负载」把多台后端聚合成一个 upstream。'
                    : '换个关键词试试。'
                }
              />
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

      {!canWrite && (
        <p className="text-xs text-muted">创建与启停需要 operator 角色,删除与设置需要 admin。</p>
      )}

      {creating && (
        <CreateGroupModal
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false)
            setFeedback({ kind: 'ok', text: `均衡组 ${name} 已创建` })
            void load()
          }}
        />
      )}
      {detail && <DetailModal group={detail} onClose={() => setDetailId(null)} />}
      {settingsOpen && <SettingsModal isAdmin={isAdmin} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

interface NodeRow {
  key: string
  host: string
  port: string
  weight: string
}

interface CreateForm {
  name: string
  algo: string
  listen: string
  server_name: string
  nodes: NodeRow[]
}

function emptyNode(): NodeRow {
  return { key: uid(), host: '', port: '', weight: '1' }
}

/** CreateGroupModal 固定尺寸创建弹窗:名称/调度策略/监听/域名 + 逐行后端节点。 */
function CreateGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (name: string) => void
}) {
  const [form, setForm] = useState<CreateForm>({
    name: '',
    algo: 'round-robin',
    listen: '80',
    server_name: '',
    nodes: [emptyNode()],
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function set<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setNode(key: string, patch: Partial<NodeRow>) {
    setForm((f) => ({
      ...f,
      nodes: f.nodes.map((n) => (n.key === key ? { ...n, ...patch } : n)),
    }))
  }

  function addNode() {
    setForm((f) => ({ ...f, nodes: [...f.nodes, emptyNode()] }))
  }

  function removeNode(key: string) {
    setForm((f) =>
      f.nodes.length <= 1 ? f : { ...f, nodes: f.nodes.filter((n) => n.key !== key) },
    )
  }

  // parseBackends 把节点行解析为后端数组,非法即抛错(host:port:weight)。
  function parseBackends(): Backend[] {
    const out: Backend[] = []
    for (const n of form.nodes) {
      const host = n.host.trim()
      if (!host) continue
      const port = Number(n.port)
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(`节点端口错误: ${host}`)
      }
      const weight = n.weight.trim() === '' ? 1 : Number(n.weight)
      if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
        throw new Error(`节点权重需为 1–100: ${host}`)
      }
      out.push({ host, port, weight, max_fails: 0, fail_timeout: '' })
    }
    if (out.length === 0) throw new Error('至少需要一个后端节点')
    return out
  }

  const canSubmit = form.name.trim().length > 0 && !busy

  async function submit() {
    if (!canSubmit) return
    let backends: Backend[]
    try {
      backends = parseBackends()
    } catch (e) {
      setErr(errorText(e))
      return
    }
    setBusy(true)
    setErr(null)
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
      onCreated(form.name.trim())
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="添加负载" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">配置生成后经 nginx -t 校验,失败则不创建。</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="名称"
            placeholder="例如 web-cluster"
            value={form.name}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoFocus
            onChange={(e) => set('name', e.target.value)}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">调度策略</span>
            <select
              className={fieldClass}
              value={form.algo}
              onChange={(e) => set('algo', e.target.value)}
            >
              {ALGOS.map((a) => (
                <option key={a} value={a}>
                  {ALGO_LABEL[a] ?? a}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="监听端口"
            inputMode="numeric"
            value={form.listen}
            onChange={(e) => set('listen', e.target.value)}
          />
          <Input
            label="域名 (server_name)"
            placeholder="例如 lb.example.com"
            value={form.server_name}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => set('server_name', e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">后端节点</span>
            <Button size="sm" variant="ghost" onClick={addNode}>
              <Plus size={14} />
              添加节点
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_88px_88px_36px] items-center gap-2 px-1 text-[11px] text-muted">
            <span>地址 (host)</span>
            <span>端口</span>
            <span>权重</span>
            <span />
          </div>
          <div className="flex flex-col gap-2">
            {form.nodes.map((n) => (
              <div key={n.key} className="grid grid-cols-[1fr_88px_88px_36px] items-center gap-2">
                <input
                  className={fieldClass}
                  placeholder="10.0.0.1"
                  spellCheck={false}
                  value={n.host}
                  onChange={(e) => setNode(n.key, { host: e.target.value })}
                />
                <input
                  className={fieldClass}
                  placeholder="8080"
                  inputMode="numeric"
                  value={n.port}
                  onChange={(e) => setNode(n.key, { port: e.target.value })}
                />
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={n.weight}
                  onChange={(e) => setNode(n.key, { weight: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="移除节点"
                  disabled={form.nodes.length <= 1}
                  onClick={() => removeNode(n.key)}
                  className="inline-flex h-10 w-9 items-center justify-center rounded-(--radius-sm) text-muted transition hover:bg-surface-2 hover:text-crit disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            创建
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** DetailModal 均衡组详情:节点列表(含节点健康)+ 生成的 nginx 配置(只读)。 */
function DetailModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const [health, setHealth] = useState<Map<string, BackendHealth> | null>(null)
  const [healthBusy, setHealthBusy] = useState(false)
  const [healthErr, setHealthErr] = useState<string | null>(null)

  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

  const checkHealth = useCallback(async () => {
    setHealthBusy(true)
    setHealthErr(null)
    try {
      const res = await apiFetch<GroupHealth>(`/api/m/loadbalancer/groups/${group.id}/health`)
      setHealth(new Map(res.backends.map((b) => [`${b.host}:${b.port}`, b])))
    } catch (e) {
      setHealthErr(errorText(e))
    } finally {
      setHealthBusy(false)
    }
  }, [group.id])

  useEffect(() => {
    void checkHealth()
  }, [checkHealth])

  const upCount = health == null ? null : group.backends.filter((b) => health.get(`${b.host}:${b.port}`)?.up).length

  const total = group.backends.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  const pageRows = group.backends.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <Modal title={`均衡组 · ${group.name}`} size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge status={group.enabled ? 'online' : 'neutral'}>
            {group.enabled ? '运行中' : '已停用'}
          </Badge>
          <span>{ALGO_LABEL[group.algo] ?? group.algo}</span>
          <span className="font-[family-name:var(--font-mono)]">
            {group.server_name || '—'} :{group.listen}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">
              后端节点 ({group.backends.length})
              {upCount != null && (
                <span className="ml-2 text-xs text-online">{upCount}/{group.backends.length} 在线</span>
              )}
            </span>
            <Button size="sm" variant="ghost" disabled={healthBusy} onClick={() => void checkHealth()}>
              {healthBusy && <Spinner size={14} />}
              检测健康
            </Button>
          </div>
          {healthErr && <p className="text-xs text-crit">{healthErr}</p>}
          <Table
            columns={[
              {
                key: 'host',
                header: '地址',
                cell: (b: Backend) => (
                  <span className="font-[family-name:var(--font-mono)] text-xs text-text">
                    {b.host}:{b.port}
                  </span>
                ),
              },
              {
                key: 'health',
                header: '健康',
                width: '92px',
                cell: (b: Backend) => {
                  const h = health?.get(`${b.host}:${b.port}`)
                  if (!h) return <span className="text-muted">{healthBusy ? '检测中…' : '—'}</span>
                  return <Badge status={h.up ? 'online' : 'crit'}>{h.up ? '在线' : '离线'}</Badge>
                },
              },
              {
                key: 'response_ms',
                header: '响应',
                width: '80px',
                cell: (b: Backend) => {
                  const h = health?.get(`${b.host}:${b.port}`)
                  return <span className="text-muted">{h?.up ? `${h.response_ms} ms` : '—'}</span>
                },
              },
              {
                key: 'weight',
                header: '权重',
                width: '70px',
                cell: (b: Backend) => <span className="text-muted">{b.weight}</span>,
              },
              {
                key: 'error',
                header: '错误',
                cell: (b: Backend) => {
                  const h = health?.get(`${b.host}:${b.port}`)
                  return (
                    <span
                      className="block truncate text-xs text-crit"
                      title={h?.error || undefined}
                    >
                      {h?.error || '—'}
                    </span>
                  )
                },
              },
            ]}
            rows={pageRows}
            rowKey={(b) => `${b.host}:${b.port}`}
            emptyText="无后端节点"
          />
          {total > pageSize && (
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

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">生成的 nginx 配置</span>
          <pre className="max-h-56 overflow-auto rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-muted">
            {group.config}
          </pre>
        </div>

        <div className="flex items-center justify-end">
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** SettingsModal 服务设置:nginx upstream 配置目录,仅 admin 可改。 */
function SettingsModal({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    apiFetch<Settings>('/api/m/loadbalancer/settings')
      .then(setSettings)
      .catch((e) => setErr(errorText(e)))
  }, [])

  async function save() {
    if (!settings || !isAdmin) return
    setBusy(true)
    setErr(null)
    try {
      const saved = await apiFetch<Settings>('/api/m/loadbalancer/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setSettings(saved)
      setOk(true)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="负载均衡设置" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!settings ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : (
          <Input
            label="nginx 配置目录 (conf_dir)"
            className="font-[family-name:var(--font-mono)]"
            value={settings.conf_dir}
            disabled={!isAdmin}
            spellCheck={false}
            onChange={(e) => {
              const v = e.target.value
              setSettings((s) => (s ? { ...s, conf_dir: v } : s))
              setOk(false)
            }}
          />
        )}

        {err && <p className="text-sm text-crit">{err}</p>}
        {ok && <p className="text-sm text-online">设置已保存。</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          {isAdmin && (
            <Button onClick={() => void save()} disabled={!settings || busy}>
              {busy && <Spinner size={14} />}
              保存
            </Button>
          )}
        </div>
        {!isAdmin && <p className="text-xs text-muted">修改设置需要 admin 角色。</p>}
      </div>
    </Modal>
  )
}
