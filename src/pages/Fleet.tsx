import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { IconButton } from '../components/IconButton'
import { ChevronLeft, ChevronRight, KeyRound, Search, Server } from 'lucide-react'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

// 心跳新鲜窗口:last_seen 在此秒数内视为在线。
const ONLINE_WINDOW_SEC = 90

const PAGE_SIZES = [10, 20, 50] as const

interface Node {
  id: string
  name: string
  tags: string
  version: string
  status: string // pending | active
  last_seen: number
  enrolled_at: number
}

interface JobResult {
  job_id: number
  node_id: string
  status: string // pending | running | success | failed | timeout
  exit_code: number
  output: string
  duration_ms: number
}

interface JobSummary {
  total: number
  success: number
  failed: number
  timeout: number
}

interface JobResp {
  job_id: number
  results: JobResult[]
  summary: JobSummary
}

type SelectorKind = 'all' | 'tag' | 'ids'

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

function isOnline(n: Node): boolean {
  return n.status === 'active' && Date.now() / 1000 - n.last_seen < ONLINE_WINDOW_SEC
}

const resultStatus: Record<string, { badge: 'online' | 'crit' | 'warn' | 'neutral'; label: string }> = {
  success: { badge: 'online', label: '成功' },
  failed: { badge: 'crit', label: '失败' },
  timeout: { badge: 'warn', label: '超时' },
  running: { badge: 'neutral', label: '执行中' },
  pending: { badge: 'neutral', label: '待执行' },
}

/** 集群(fleet):节点列表(审批/移除)、生成入网 token、扇出执行命令并按节点聚合结果。 */
export default function Fleet() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  const [enrollToken, setEnrollToken] = useState<string | null>(null)

  const [nodePageSize, setNodePageSize] = useState<number>(PAGE_SIZES[0])
  const [nodePage, setNodePage] = useState(0)

  const [argv, setArgv] = useState('')
  const [selKind, setSelKind] = useState<SelectorKind>('all')
  const [selValue, setSelValue] = useState('')
  const [timeout, setTimeoutSec] = useState('30')
  const [job, setJob] = useState<JobResp | null>(null)
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const [resultPageSize, setResultPageSize] = useState<number>(PAGE_SIZES[0])
  const [resultPage, setResultPage] = useState(0)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setNodes(await apiFetch<Node[]>('/api/m/fleet/nodes'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const approve = useCallback(
    async (n: Node) => {
      if (busy || !isAdmin) return
      setBusy(true)
      setFeedback(null)
      try {
        await apiFetch(`/api/m/fleet/nodes/${encodeURIComponent(n.id)}/approve`, { method: 'POST' })
        setFeedback({ kind: 'ok', text: `节点 ${n.id} 已审批` })
        await load()
      } catch (e) {
        setFeedback({ kind: 'err', text: errorText(e) })
      } finally {
        setBusy(false)
      }
    },
    [busy, isAdmin, load],
  )

  const remove = useCallback(
    async (n: Node) => {
      if (busy || !isAdmin) return
      if (!window.confirm(`确认移除节点 ${n.id}?`)) return
      setBusy(true)
      setFeedback(null)
      try {
        await apiFetch(`/api/m/fleet/nodes/${encodeURIComponent(n.id)}`, { method: 'DELETE' })
        setFeedback({ kind: 'ok', text: `节点 ${n.id} 已移除` })
        await load()
      } catch (e) {
        setFeedback({ kind: 'err', text: errorText(e) })
      } finally {
        setBusy(false)
      }
    },
    [busy, isAdmin, load],
  )

  async function genToken() {
    if (busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    setEnrollToken(null)
    try {
      const res = await apiFetch<{ token: string }>('/api/m/fleet/enroll-tokens', { method: 'POST' })
      setEnrollToken(res.token)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function buildSelector(): string {
    if (selKind === 'all') return 'all'
    return `${selKind}:${selValue.trim()}`
  }

  // 把命令文本按空白拆为 argv 数组(简单拆分,复杂引号场景按行不支持)。
  function parseArgv(): string[] {
    return argv.trim().split(/\s+/).filter(Boolean)
  }

  async function execute() {
    if (busy || !isAdmin) return
    const parsed = parseArgv()
    if (parsed.length === 0) {
      setFeedback({ kind: 'err', text: 'argv 不能为空' })
      return
    }
    if (selKind !== 'all' && selValue.trim().length === 0) {
      setFeedback({ kind: 'err', text: '请填写选择器的值' })
      return
    }
    setBusy(true)
    setFeedback(null)
    setOpenRows(new Set())
    setResultPage(0)
    try {
      const res = await apiFetch<JobResp>('/api/m/fleet/jobs', {
        method: 'POST',
        body: JSON.stringify({
          argv: parsed,
          selector: buildSelector(),
          timeout_sec: Number(timeout) || 30,
        }),
      })
      setJob(res)
      setFeedback({ kind: 'ok', text: `任务 #${res.job_id} 已下发` })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function toggleRow(nodeID: string) {
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(nodeID)) next.delete(nodeID)
      else next.add(nodeID)
      return next
    })
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return nodes
    return nodes.filter(
      (n) =>
        n.id.toLowerCase().includes(q) ||
        n.name.toLowerCase().includes(q) ||
        n.tags.toLowerCase().includes(q),
    )
  }, [nodes, query])

  // 搜索/每页条数变化或行数缩减时,把当前页夹回有效范围,避免停在空页。
  const nodeTotal = visible.length
  const nodePageCount = Math.max(1, Math.ceil(nodeTotal / nodePageSize))
  useEffect(() => {
    if (nodePage > nodePageCount - 1) setNodePage(nodePageCount - 1)
  }, [nodePage, nodePageCount])
  const nodeRows = useMemo(
    () => visible.slice(nodePage * nodePageSize, nodePage * nodePageSize + nodePageSize),
    [visible, nodePage, nodePageSize],
  )

  const resultTotal = job?.results.length ?? 0
  const resultPageCount = Math.max(1, Math.ceil(resultTotal / resultPageSize))
  useEffect(() => {
    if (resultPage > resultPageCount - 1) setResultPage(resultPageCount - 1)
  }, [resultPage, resultPageCount])
  const resultRows = useMemo(
    () => (job ? job.results.slice(resultPage * resultPageSize, resultPage * resultPageSize + resultPageSize) : []),
    [job, resultPage, resultPageSize],
  )

  const columns: Column<Node>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '名称',
        cell: (n) => (
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <Server size={15} className="shrink-0 text-brand" />
            <span className="truncate">{n.name || n.id}</span>
          </span>
        ),
      },
      {
        key: 'id',
        header: '节点 ID',
        cell: (n) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {n.id}
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '96px',
        cell: (n) =>
          n.status === 'pending' ? (
            <Badge status="warn">待审批</Badge>
          ) : isOnline(n) ? (
            <Badge status="online">在线</Badge>
          ) : (
            <Badge status="neutral">离线</Badge>
          ),
      },
      {
        key: 'tags',
        header: '标签',
        width: '140px',
        cell: (n) => (
          <span className="truncate text-xs text-muted">{n.tags || '—'}</span>
        ),
      },
      {
        key: 'version',
        header: '版本',
        width: '80px',
        cell: (n) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
            v{n.version || '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '130px',
        align: 'right',
        cell: (n) => (
          <ActionLinks>
            {n.status === 'pending' && (
              <ActionLink
                disabled={busy || !isAdmin}
                title={isAdmin ? '审批节点' : '需要 admin 角色'}
                onClick={() => void approve(n)}
              >
                审批
              </ActionLink>
            )}
            <ActionLink
              danger
              disabled={busy || !isAdmin}
              aria-label="移除节点"
              title={isAdmin ? '移除节点' : '需要 admin 角色'}
              onClick={() => void remove(n)}
            >
              移除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, busy, approve, remove],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="md" disabled={busy || !isAdmin} onClick={() => void genToken()}>
            <KeyRound size={15} />
            生成入网 token
          </Button>
          <Button variant="ghost" size="md" onClick={() => void load()} disabled={busy}>
            刷新
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
            placeholder="搜索名称、ID 或标签"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
      </div>

      {enrollToken && (
        <div className="flex flex-col gap-1.5 rounded-(--radius-card) border border-warn/40 bg-warn/10 p-3">
          <span className="text-xs text-warn">入网 token 仅展示一次,请立即复制保存。</span>
          <code className="break-all font-[family-name:var(--font-mono)] text-xs text-text">
            {enrollToken}
          </code>
        </div>
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

      {loadErr && nodes.length === 0 && !loading && (
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
        <>
          <Table
            columns={columns}
            rows={nodeRows}
            rowKey={(n) => n.id}
            emptyText={
              <EmptyState
                icon={<Server />}
                title={nodes.length === 0 ? '还没有节点' : '没有匹配的节点'}
                hint={
                  nodes.length === 0
                    ? '点击「生成入网 token」让新 agent 加入集群。'
                    : '换个关键词试试。'
                }
              />
            }
          />
          {nodeTotal > 0 && (
            <Pager
              total={nodeTotal}
              page={nodePage}
              pageCount={nodePageCount}
              pageSize={nodePageSize}
              onPageSize={(n) => {
                setNodePageSize(n)
                setNodePage(0)
              }}
              onPage={setNodePage}
            />
          )}
        </>
      )}

      {!isAdmin && <p className="text-xs text-muted">节点审批、移除与命令下发需要 admin 角色。</p>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">执行命令</h2>
        <Input
          label="命令 argv(空格分隔)"
          placeholder="例如 systemctl restart nginx"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          value={argv}
          onChange={(e) => setArgv(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">目标选择器</span>
            <select
              className={fieldClass}
              value={selKind}
              onChange={(e) => setSelKind(e.target.value as SelectorKind)}
            >
              <option value="all">全部节点</option>
              <option value="tag">按标签 (tag)</option>
              <option value="ids">按 ID 列表 (ids)</option>
            </select>
          </label>
          {selKind !== 'all' && (
            <Input
              label={selKind === 'tag' ? '标签' : 'ID 列表(逗号分隔)'}
              spellCheck={false}
              value={selValue}
              onChange={(e) => setSelValue(e.target.value)}
            />
          )}
          <Input
            label="超时(秒)"
            type="number"
            min={1}
            value={timeout}
            onChange={(e) => setTimeoutSec(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void execute()} disabled={busy || !isAdmin}>
            下发执行
          </Button>
          {busy && <Spinner size={16} />}
        </div>
      </Card>

      {job && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-medium text-text">任务 #{job.job_id} 结果</h2>
            <Badge status="neutral">共 {job.summary.total}</Badge>
            <Badge status="online">成功 {job.summary.success}</Badge>
            <Badge status="crit">失败 {job.summary.failed}</Badge>
            <Badge status="warn">超时 {job.summary.timeout}</Badge>
          </div>
          <Table
            columns={[
              {
                key: 'node_id',
                header: '节点 ID',
                cell: (r: JobResult) => (
                  <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">
                    {r.node_id}
                  </span>
                ),
              },
              {
                key: 'status',
                header: '状态',
                width: '96px',
                cell: (r: JobResult) => {
                  const meta = resultStatus[r.status] ?? resultStatus.pending
                  return <Badge status={meta.badge}>{meta.label}</Badge>
                },
              },
              {
                key: 'exit',
                header: '退出码',
                width: '80px',
                align: 'right',
                cell: (r: JobResult) => (
                  <span className="font-[family-name:var(--font-mono)] text-xs text-muted tabular-nums">
                    {r.exit_code}
                  </span>
                ),
              },
              {
                key: 'duration',
                header: '耗时',
                width: '90px',
                align: 'right',
                cell: (r: JobResult) => (
                  <span className="font-[family-name:var(--font-mono)] text-xs text-muted tabular-nums">
                    {r.duration_ms}ms
                  </span>
                ),
              },
              {
                key: 'actions',
                header: '操作',
                width: '70px',
                align: 'right',
                cell: (r: JobResult) => (
                  <ActionLinks>
                    <ActionLink disabled={!r.output} onClick={() => toggleRow(r.node_id)}>
                      {openRows.has(r.node_id) ? '收起' : '输出'}
                    </ActionLink>
                  </ActionLinks>
                ),
              },
            ]}
            rows={resultRows}
            rowKey={(r) => r.node_id}
            emptyText="该任务无目标节点。"
          />
          {resultTotal > 0 && (
            <Pager
              total={resultTotal}
              page={resultPage}
              pageCount={resultPageCount}
              pageSize={resultPageSize}
              onPageSize={(n) => {
                setResultPageSize(n)
                setResultPage(0)
              }}
              onPage={setResultPage}
            />
          )}
          {resultRows
            .filter((r) => openRows.has(r.node_id) && r.output)
            .map((r) => (
              <div key={r.node_id} className="flex flex-col gap-1.5">
                <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
                  {r.node_id}
                </span>
                <pre className="overflow-x-auto rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-muted">
                  {r.output}
                </pre>
              </div>
            ))}
        </Card>
      )}
    </div>
  )
}

/** Pager 表格底部分页:共 N 条 + 每页条数选择 + 上/下页,与 Sites 页一致。 */
function Pager({
  total,
  page,
  pageCount,
  pageSize,
  onPageSize,
  onPage,
}: {
  total: number
  page: number
  pageCount: number
  pageSize: number
  onPageSize: (n: number) => void
  onPage: (updater: (p: number) => number) => void
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
          onClick={() => onPage((p) => Math.max(0, p - 1))}
        />
        <span className="tabular-nums px-1">
          {page + 1} / {pageCount}
        </span>
        <IconButton
          aria-label="下一页"
          className="h-8 w-8"
          disabled={page >= pageCount - 1}
          icon={<ChevronRight size={16} />}
          onClick={() => onPage((p) => Math.min(pageCount - 1, p + 1))}
        />
      </div>
    </div>
  )
}
