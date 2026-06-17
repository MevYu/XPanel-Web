import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import {
  Plus,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldX,
  Gauge,
  Ban,
  FileWarning,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { uid } from '../lib/uid'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

type Feedback = { kind: 'ok' | 'err'; text: string } | null

interface IPRule {
  id: number
  action: 'allow' | 'deny'
  cidr: string
  comment: string
  enabled: boolean
}

interface MatchRule {
  id: number
  target: 'uri' | 'ua'
  pattern: string
  action: 'block' | 'allow'
  comment: string
  enabled: boolean
}

interface CCConfig {
  enabled: boolean
  rate_per_sec: number
  burst: number
  conn_per_ip: number
  zone_size_mb: number
}

interface WafConfig {
  http: string
  server: string
}

interface WafStats {
  total: number
  blocked: number
  limited: number
  log_exists: boolean
}

type Tab = 'guard' | 'rules' | 'log'

const TABS: { key: Tab; label: string }[] = [
  { key: 'guard', label: '防护设置' },
  { key: 'rules', label: '规则' },
  { key: 'log', label: '拦截统计' },
]

/** Waf 网站防火墙(aaPanel 布局):顶部 CC 防护总开关 + 应用,tab 切换 防护设置/规则/拦截统计;规则走紧凑表 + 固定尺寸弹窗表单。 */
export default function Waf() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [tab, setTab] = useState<Tab>('guard')

  const [cc, setCc] = useState<CCConfig | null>(null)
  const [stats, setStats] = useState<WafStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [applyOpen, setApplyOpen] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [c, s] = await Promise.all([
        apiFetch<CCConfig>('/api/m/waf/cc'),
        apiFetch<WafStats>('/api/m/waf/stats'),
      ])
      setCc(c)
      setStats(s)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 总开关直接落 CC 防护 enabled(apply 后才在 nginx 生效)。
  async function toggleMaster(next: boolean) {
    if (!cc || !isAdmin || busy) return
    const optimistic = { ...cc, enabled: next }
    setCc(optimistic)
    setBusy(true)
    setFeedback(null)
    try {
      const saved = await apiFetch<CCConfig>('/api/m/waf/cc', {
        method: 'PUT',
        body: JSON.stringify(optimistic),
      })
      setCc(saved)
      setFeedback({ kind: 'ok', text: next ? 'CC 防护已开启(应用后生效)' : 'CC 防护已关闭(应用后生效)' })
    } catch (e) {
      setCc(cc)
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!isAdmin || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/waf/apply', { method: 'POST', headers: DANGER })
      setApplyOpen(false)
      setFeedback({ kind: 'ok', text: '已生成配置并重载 nginx' })
      await load()
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

  const guarded = cc?.enabled ?? false

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
              网站防火墙
            </h1>
            <Badge status={guarded ? 'online' : 'neutral'}>{guarded ? '防护中' : '已关闭'}</Badge>
          </div>
          <p className="text-xs text-muted">
            {stats
              ? `扫描 ${stats.total.toLocaleString()} 行 · 拦截 ${stats.blocked.toLocaleString()} · 限流 ${stats.limited.toLocaleString()}`
              : '基于 nginx 的 IP / URL / UA 规则与 CC 防御'}
          </p>
        </div>
      </header>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Switch
            checked={guarded}
            onChange={(next) => void toggleMaster(next)}
            disabled={!isAdmin || busy}
            aria-label="CC 防护总开关"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text">CC 防护总开关</span>
            <span className="text-xs text-muted">
              {guarded ? 'CC 限速 / 限连已启用,应用后随规则一并下发' : 'CC 限速 / 限连未启用'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {busy && <Spinner size={16} />}
          <Button variant="ghost" size="md" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={15} />
            刷新
          </Button>
          <Button
            size="md"
            disabled={!isAdmin || busy}
            title={isAdmin ? undefined : '需要 admin 角色'}
            onClick={() => setApplyOpen(true)}
          >
            <Rocket size={15} />
            生成并应用
          </Button>
        </div>
      </Card>

      {!isAdmin && <p className="text-xs text-muted">写操作与应用配置需要 admin 角色。</p>}

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      {loadErr && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      <div className="flex gap-0.5 self-start rounded-(--radius-sm) border border-border bg-surface p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`h-9 rounded-sm px-4 text-[13px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
              tab === t.key ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2/60 hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'guard' && <GuardSettings isAdmin={isAdmin} cc={cc} onCc={setCc} />}
      {tab === 'rules' && <Rules isAdmin={isAdmin} />}
      {tab === 'log' && <StatsPanel stats={stats} />}

      {applyOpen && (
        <Modal title="生成并应用配置" size="sm" onClose={() => (busy ? undefined : setApplyOpen(false))}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text">
              将根据当前规则生成 nginx 配置并执行{' '}
              <span className="font-[family-name:var(--font-mono)] text-text">nginx -t</span> 校验后{' '}
              <span className="text-warn">reload</span>。校验失败会自动回滚。
            </p>
            <p className="text-xs text-muted">此操作会影响线上 nginx,请确认规则无误。</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="md" disabled={busy} onClick={() => setApplyOpen(false)}>
                取消
              </Button>
              <Button size="md" disabled={busy || !isAdmin} onClick={() => void apply()}>
                确认应用
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

interface MetricProps {
  icon: LucideIcon
  tint: string
  value: string
  label: string
}

/** Metric aaPanel 风指标小卡:暖色图标 + 大号 mono 读数 + muted 标签。 */
function Metric({ icon: Icon, tint, value, label }: MetricProps) {
  return (
    <div className="flex items-center gap-3 rounded-(--radius-card) border border-border bg-surface-2/40 px-3.5 py-3">
      <Icon size={20} className={`shrink-0 ${tint}`} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-[family-name:var(--font-mono)] text-xl font-medium tabular-nums tracking-tight text-text">
          {value}
        </span>
        <span className="truncate text-xs text-muted">{label}</span>
      </div>
    </div>
  )
}

function StatsPanel({ stats }: { stats: WafStats | null }) {
  if (!stats) return <Card className="text-sm text-muted">暂无统计数据。</Card>
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric icon={Gauge} tint="text-amber-400" value={stats.total.toLocaleString()} label="扫描行数" />
        <Metric icon={ShieldX} tint="text-rose-400" value={stats.blocked.toLocaleString()} label="已拦截 (403/444)" />
        <Metric icon={Ban} tint="text-orange-400" value={stats.limited.toLocaleString()} label="已限流 (429/503)" />
        <div className="flex items-center gap-3 rounded-(--radius-card) border border-border bg-surface-2/40 px-3.5 py-3">
          <FileWarning size={20} className={`shrink-0 ${stats.log_exists ? 'text-amber-400' : 'text-rose-400'}`} />
          <div className="flex min-w-0 flex-col gap-1">
            <Badge status={stats.log_exists ? 'online' : 'warn'}>
              {stats.log_exists ? '存在' : '缺失'}
            </Badge>
            <span className="truncate text-xs text-muted">日志文件</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">
        统计来自扫描 nginx 访问日志的状态码聚合,非逐条拦截事件;开启「生成并应用」后规则才在 nginx 生效。
      </p>
    </div>
  )
}

function GuardSettings({
  isAdmin,
  cc,
  onCc,
}: {
  isAdmin: boolean
  cc: CCConfig | null
  onCc: (cc: CCConfig) => void
}) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [draft, setDraft] = useState<CCConfig | null>(cc)

  useEffect(() => {
    setDraft(cc)
  }, [cc])

  async function save() {
    if (!draft || !isAdmin || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const saved = await apiFetch<CCConfig>('/api/m/waf/cc', {
        method: 'PUT',
        body: JSON.stringify(draft),
      })
      onCc(saved)
      setFeedback({ kind: 'ok', text: 'CC 防御已保存(应用后生效)' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function num(key: keyof CCConfig) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => (d ? { ...d, [key]: Number(e.target.value) || 0 } : d))
  }

  if (!draft) return <Card className="text-sm text-muted">暂无 CC 配置。</Card>

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className="text-amber-400" />
          <h2 className="text-sm font-medium text-text">CC 防御阈值</h2>
        </div>
        <p className="text-xs text-muted">
          落到 nginx <span className="font-[family-name:var(--font-mono)]">limit_req</span> /{' '}
          <span className="font-[family-name:var(--font-mono)]">limit_conn</span>。仅在总开关开启且应用后生效。
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="每秒请求 (1–100000)"
            inputMode="numeric"
            value={String(draft.rate_per_sec)}
            onChange={num('rate_per_sec')}
          />
          <Input
            label="突发 burst (0–100000)"
            inputMode="numeric"
            value={String(draft.burst)}
            onChange={num('burst')}
          />
          <Input
            label="单 IP 连接数 (0–100000)"
            inputMode="numeric"
            value={String(draft.conn_per_ip)}
            onChange={num('conn_per_ip')}
          />
          <Input
            label="共享内存 MB (1–1024)"
            inputMode="numeric"
            value={String(draft.zone_size_mb)}
            onChange={num('zone_size_mb')}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="md" onClick={() => void save()} disabled={!isAdmin || busy}>
            保存
          </Button>
          {busy && <Spinner size={16} />}
          {feedback && (
            <span className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
              {feedback.text}
            </span>
          )}
        </div>
      </Card>
      <ConfigPreview />
    </div>
  )
}

function Rules({ isAdmin }: { isAdmin: boolean }) {
  const [ip, setIp] = useState<IPRule[]>([])
  const [match, setMatch] = useState<MatchRule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [ipOpen, setIpOpen] = useState(false)
  const [matchOpen, setMatchOpen] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [i, m] = await Promise.all([
        apiFetch<IPRule[]>('/api/m/waf/ip'),
        apiFetch<MatchRule[]>('/api/m/waf/match'),
      ])
      setIp(i)
      setMatch(m)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function removeIP(r: IPRule) {
    if (!isAdmin || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/waf/ip/${r.id}`, { method: 'DELETE', headers: DANGER })
      setIp((prev) => prev.filter((x) => x.id !== r.id))
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function removeMatch(r: MatchRule) {
    if (!isAdmin || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/waf/match/${r.id}`, { method: 'DELETE', headers: DANGER })
      setMatch((prev) => prev.filter((x) => x.id !== r.id))
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const ipColumns = useMemo<Column<IPRule>[]>(
    () => [
      { key: 'type', header: '类型', width: '72px', cell: () => <Badge status="neutral">IP</Badge> },
      {
        key: 'cidr',
        header: '规则',
        cell: (r) => <span className="font-[family-name:var(--font-mono)] text-xs text-text">{r.cidr}</span>,
      },
      {
        key: 'action',
        header: '动作',
        width: '92px',
        cell: (r) => <Badge status={r.action === 'deny' ? 'crit' : 'online'}>{r.action}</Badge>,
      },
      {
        key: 'status',
        header: '状态',
        width: '80px',
        cell: (r) => <Badge status={r.enabled ? 'online' : 'warn'}>{r.enabled ? '启用' : '停用'}</Badge>,
      },
      {
        key: 'comment',
        header: '备注',
        cell: (r) => <span className="truncate text-xs text-muted">{r.comment || '—'}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '72px',
        align: 'right',
        cell: (r) => (
          <ActionLinks>
            <ActionLink
              danger
              disabled={!isAdmin || busy}
              title={isAdmin ? '删除规则' : '需要 admin 角色'}
              onClick={() => void removeIP(r)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, busy],
  )

  const matchColumns = useMemo<Column<MatchRule>[]>(
    () => [
      {
        key: 'type',
        header: '类型',
        width: '72px',
        cell: (r) => <Badge status="neutral">{r.target.toUpperCase()}</Badge>,
      },
      {
        key: 'pattern',
        header: '规则',
        cell: (r) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">{r.pattern}</span>
        ),
      },
      {
        key: 'action',
        header: '动作',
        width: '92px',
        cell: (r) => <Badge status={r.action === 'block' ? 'crit' : 'online'}>{r.action}</Badge>,
      },
      {
        key: 'status',
        header: '状态',
        width: '80px',
        cell: (r) => <Badge status={r.enabled ? 'online' : 'warn'}>{r.enabled ? '启用' : '停用'}</Badge>,
      },
      {
        key: 'comment',
        header: '备注',
        cell: (r) => <span className="truncate text-xs text-muted">{r.comment || '—'}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '72px',
        align: 'right',
        cell: (r) => (
          <ActionLinks>
            <ActionLink
              danger
              disabled={!isAdmin || busy}
              title={isAdmin ? '删除规则' : '需要 admin 角色'}
              onClick={() => void removeMatch(r)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, busy],
  )

  return (
    <div className="flex flex-col gap-5">
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{feedback.text}</p>
      )}
      {loadErr && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text">IP 黑白名单</h2>
          <Button size="sm" disabled={!isAdmin} onClick={() => setIpOpen(true)}>
            <Plus size={14} />
            添加 IP 规则
          </Button>
        </div>
        {loading ? (
          <div className="h-24 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
        ) : (
          <Table
            columns={ipColumns}
            rows={ip}
            rowKey={(r) => r.id}
            emptyText={
              <span className="flex flex-col items-center gap-1 py-4">
                <span className="text-sm font-medium text-text">还没有 IP 规则</span>
                <span className="text-xs text-muted">添加允许 / 拒绝的 IP 或 CIDR 网段。</span>
              </span>
            }
          />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text">URL / UA 规则</h2>
          <Button size="sm" disabled={!isAdmin} onClick={() => setMatchOpen(true)}>
            <Plus size={14} />
            添加匹配规则
          </Button>
        </div>
        {loading ? (
          <div className="h-24 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
        ) : (
          <Table
            columns={matchColumns}
            rows={match}
            rowKey={(r) => r.id}
            emptyText={
              <span className="flex flex-col items-center gap-1 py-4">
                <span className="text-sm font-medium text-text">还没有匹配规则</span>
                <span className="text-xs text-muted">按请求 URI 或 User-Agent 的正则拦截 / 放行。</span>
              </span>
            }
          />
        )}
      </section>

      {ipOpen && (
        <IPRuleModal
          isAdmin={isAdmin}
          onClose={() => setIpOpen(false)}
          onCreated={(r) => {
            setIp((prev) => [...prev, r])
            setIpOpen(false)
          }}
        />
      )}
      {matchOpen && (
        <MatchRuleModal
          isAdmin={isAdmin}
          onClose={() => setMatchOpen(false)}
          onCreated={(r) => {
            setMatch((prev) => [...prev, r])
            setMatchOpen(false)
          }}
        />
      )}
    </div>
  )
}

function IPRuleModal({
  isAdmin,
  onClose,
  onCreated,
}: {
  isAdmin: boolean
  onClose: () => void
  onCreated: (r: IPRule) => void
}) {
  const [form, setForm] = useState({
    action: 'deny' as 'allow' | 'deny',
    cidr: '',
    comment: '',
    enabled: true,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const canAdd = form.cidr.trim().length > 0 && isAdmin && !busy

  async function add() {
    if (!canAdd) return
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<IPRule>('/api/m/waf/ip', {
        method: 'POST',
        body: JSON.stringify({
          action: form.action,
          cidr: form.cidr.trim(),
          comment: form.comment.trim(),
          enabled: form.enabled,
        }),
      })
      onCreated(r)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="添加 IP 规则" size="sm" onClose={() => (busy ? undefined : onClose())}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">动作</span>
          <select
            value={form.action}
            onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as 'allow' | 'deny' }))}
            className="h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <option value="deny">拒绝 deny</option>
            <option value="allow">放行 allow</option>
          </select>
        </label>
        <Input
          label="IP / CIDR"
          placeholder="例如 1.2.3.0/24"
          value={form.cidr}
          spellCheck={false}
          autoCapitalize="off"
          className="font-[family-name:var(--font-mono)]"
          onChange={(e) => setForm((f) => ({ ...f, cidr: e.target.value }))}
        />
        <Input
          label="备注"
          placeholder="可选"
          value={form.comment}
          onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
        />
        <label className="flex items-center gap-2.5">
          <Switch
            checked={form.enabled}
            onChange={(next) => setForm((f) => ({ ...f, enabled: next }))}
            aria-label="启用规则"
          />
          <span className="text-sm text-text">创建后即启用</span>
        </label>
        {!isAdmin && <p className="text-xs text-muted">写操作需要 admin 角色。</p>}
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button size="md" disabled={!canAdd} onClick={() => void add()}>
            添加
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function MatchRuleModal({
  isAdmin,
  onClose,
  onCreated,
}: {
  isAdmin: boolean
  onClose: () => void
  onCreated: (r: MatchRule) => void
}) {
  const [form, setForm] = useState({
    target: 'uri' as 'uri' | 'ua',
    pattern: '',
    action: 'block' as 'block' | 'allow',
    comment: '',
    enabled: true,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const tooLong = form.pattern.length > 512
  const canAdd = form.pattern.trim().length > 0 && !tooLong && isAdmin && !busy

  async function add() {
    if (!canAdd) return
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<MatchRule>('/api/m/waf/match', {
        method: 'POST',
        body: JSON.stringify({
          target: form.target,
          pattern: form.pattern,
          action: form.action,
          comment: form.comment.trim(),
          enabled: form.enabled,
        }),
      })
      onCreated(r)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="添加匹配规则" size="md" onClose={() => (busy ? undefined : onClose())}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">匹配对象</span>
            <select
              value={form.target}
              onChange={(e) => setForm((f) => ({ ...f, target: e.target.value as 'uri' | 'ua' }))}
              className="h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <option value="uri">请求 URI</option>
              <option value="ua">User-Agent</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">动作</span>
            <select
              value={form.action}
              onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as 'block' | 'allow' }))}
              className="h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <option value="block">拦截 block</option>
              <option value="allow">放行 allow</option>
            </select>
          </label>
        </div>
        <Input
          label="正则 pattern"
          placeholder="例如 \.(php|jsp)$"
          value={form.pattern}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          error={tooLong ? '最长 512 字符' : undefined}
          className="font-[family-name:var(--font-mono)]"
          onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
        />
        <Input
          label="备注"
          placeholder="可选"
          value={form.comment}
          onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
        />
        <label className="flex items-center gap-2.5">
          <Switch
            checked={form.enabled}
            onChange={(next) => setForm((f) => ({ ...f, enabled: next }))}
            aria-label="启用规则"
          />
          <span className="text-sm text-text">创建后即启用</span>
        </label>
        {!isAdmin && <p className="text-xs text-muted">写操作需要 admin 角色。</p>}
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button size="md" disabled={!canAdd} onClick={() => void add()}>
            添加
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ConfigPreview() {
  const [cfg, setCfg] = useState<WafConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // pre 块需稳定 key,避免非安全上下文下 randomUUID 缺失。
  const [previewKey] = useState(uid)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      setCfg(await apiFetch<WafConfig>('/api/m/waf/config'))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text">生成配置预览</h2>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? '生成中…' : '生成预览'}
        </Button>
      </div>
      {err && <p className="text-sm text-crit">{err}</p>}
      {cfg ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{'http{}'} 段</span>
            <pre
              key={`${previewKey}-http`}
              className="max-h-56 overflow-auto rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap"
            >
              {cfg.http.trim() || '(空)'}
            </pre>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{'server{}'} 段</span>
            <pre
              key={`${previewKey}-server`}
              className="max-h-56 overflow-auto rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap"
            >
              {cfg.server.trim() || '(空)'}
            </pre>
          </div>
        </div>
      ) : (
        !err && <p className="text-xs text-muted">点击「生成预览」查看将下发给 nginx 的配置片段。</p>
      )}
    </Card>
  )
}
