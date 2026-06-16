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

// 心跳新鲜窗口:last_seen 在此秒数内视为在线。
const ONLINE_WINDOW_SEC = 90

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

  const [enrollToken, setEnrollToken] = useState<string | null>(null)

  const [argv, setArgv] = useState('')
  const [selKind, setSelKind] = useState<SelectorKind>('all')
  const [selValue, setSelValue] = useState('')
  const [timeout, setTimeoutSec] = useState('30')
  const [job, setJob] = useState<JobResp | null>(null)
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())

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

  async function approve(n: Node) {
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
  }

  async function remove(n: Node) {
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
  }

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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text">入网 token</h2>
          <Button size="sm" onClick={() => void genToken()} disabled={busy || !isAdmin}>
            生成 token
          </Button>
        </div>
        {enrollToken ? (
          <div className="flex flex-col gap-1.5 rounded-(--radius-card) bg-surface-2 p-3">
            <span className="text-xs text-warn">此 token 仅展示一次,请立即复制保存。</span>
            <code className="break-all font-[family-name:var(--font-mono)] text-xs text-text">
              {enrollToken}
            </code>
          </div>
        ) : (
          <p className="text-xs text-muted">生成一次性入网 token 供新 agent 加入集群。</p>
        )}
        {!isAdmin && <p className="text-xs text-muted">节点审批与命令下发需要 admin 角色。</p>}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">节点列表</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
        </div>
        {nodes.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">暂无节点。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {nodes.map((n) => (
              <div key={n.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">
                      {n.name || n.id}
                    </span>
                    {n.status === 'pending' ? (
                      <Badge status="warn">待审批</Badge>
                    ) : isOnline(n) ? (
                      <Badge status="online">在线</Badge>
                    ) : (
                      <Badge status="neutral">离线</Badge>
                    )}
                    {n.tags && <Badge status="neutral">{n.tags}</Badge>}
                  </div>
                  <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                    {n.id} · v{n.version || '—'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {n.status === 'pending' && (
                    <Button size="sm" onClick={() => void approve(n)} disabled={busy || !isAdmin}>
                      审批
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void remove(n)}
                    disabled={busy || !isAdmin}
                  >
                    移除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

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
          {job.results.length === 0 ? (
            <p className="text-sm text-muted">该任务无目标节点。</p>
          ) : (
            <div className="divide-y divide-border rounded-(--radius-card) border border-border">
              {job.results.map((r) => {
                const meta = resultStatus[r.status] ?? resultStatus.pending
                const open = openRows.has(r.node_id)
                return (
                  <div key={r.node_id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-sm text-text">
                        {r.node_id}
                      </span>
                      <Badge status={meta.badge}>{meta.label}</Badge>
                      <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
                        exit {r.exit_code} · {r.duration_ms}ms
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleRow(r.node_id)}
                        disabled={!r.output}
                      >
                        {open ? '收起' : '输出'}
                      </Button>
                    </div>
                    {open && r.output && (
                      <pre className="overflow-x-auto rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-muted">
                        {r.output}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
