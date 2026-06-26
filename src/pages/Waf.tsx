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
import { Tabs } from '../components/Tabs'
import { EmptyState } from '../components/EmptyState'
import { InstallGate } from '../components/InstallGate'
import { IconButton } from '../components/IconButton'
import {
  Plus,
  RefreshCw,
  Rocket,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Gauge,
  Ban,
  FileWarning,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { uid } from '../lib/uid'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

const PAGE_SIZES = [10, 20, 50] as const

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

interface WafSettings {
  waf_enabled: boolean
  config_dir: string
  http_conf_name: string
  server_conf_name: string
  nginx_conf: string
  log_path: string
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

// tab 标签带计数,对齐 aaPanel「端口规则: N / IP 规则: N」。
function tabLabel(text: string, count: number) {
  return (
    <span className="flex items-center gap-1.5">
      {text}
      <span className="font-[family-name:var(--font-mono)] text-xs text-faint">{count}</span>
    </span>
  )
}

/** Waf 网站防火墙(aaPanel 布局):顶部 CC 防护总开关 + 应用,tab 切换 防护设置/规则/拦截统计;规则走紧凑表 + 固定尺寸弹窗表单。 */
export default function Waf() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [tab, setTab] = useState<Tab>('guard')

  const [cc, setCc] = useState<CCConfig | null>(null)
  const [settings, setSettings] = useState<WafSettings | null>(null)
  const [stats, setStats] = useState<WafStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [c, g, s] = await Promise.all([
        apiFetch<CCConfig>('/api/m/waf/cc'),
        apiFetch<WafSettings>('/api/m/waf/settings'),
        apiFetch<WafStats>('/api/m/waf/stats'),
      ])
      setCc(c)
      setSettings(g)
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

  // 全局 WAF 总开关:PUT 回完整 settings,仅翻转 waf_enabled。关闭=整体卸防护,带 X-Confirm-Danger。
  async function toggleGlobal(next: boolean) {
    if (!settings || !isAdmin || busy) return
    const optimistic = { ...settings, waf_enabled: next }
    setSettings(optimistic)
    setBusy(true)
    setFeedback(null)
    try {
      const saved = await apiFetch<WafSettings>('/api/m/waf/settings', {
        method: 'PUT',
        body: JSON.stringify(optimistic),
        headers: next ? undefined : DANGER,
      })
      setSettings(saved)
      setFeedback({
        kind: 'ok',
        text: next ? '全局防护已开启(应用后生效)' : '已关闭全局防护(应用后生效)',
      })
    } catch (e) {
      setSettings(settings)
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
  const wafOn = settings?.waf_enabled ?? false

  return (
    <InstallGate moduleId="waf">
    <div className="flex flex-col gap-4">
      {/* 顶部状态开关条:对齐 aaPanel —— 左侧 WAF/CC 开关,右侧刷新 + 生成并应用 */}
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 py-3">
        <label className="flex items-center gap-2.5">
          {wafOn ? (
            <ShieldCheck size={16} className="text-online" />
          ) : (
            <ShieldOff size={16} className="text-muted" />
          )}
          <span className="text-sm text-text">开启 WAF</span>
          <Switch
            checked={wafOn}
            onChange={(next) => {
              if (next) void toggleGlobal(true)
              else setDisableOpen(true)
            }}
            disabled={!isAdmin || busy || !settings}
            aria-label="全局 WAF 总开关"
          />
        </label>
        <label className="flex items-center gap-2.5">
          <ShieldAlert size={16} className="text-warn" />
          <span className="text-sm text-text">CC 防护</span>
          <Switch
            checked={guarded}
            onChange={(next) => void toggleMaster(next)}
            disabled={!isAdmin || busy}
            aria-label="CC 防护总开关"
          />
        </label>
        <div className="ml-auto flex items-center gap-x-6 gap-y-2">
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

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'guard' && <GuardSettings isAdmin={isAdmin} cc={cc} onCc={setCc} />}
      {tab === 'rules' && <Rules isAdmin={isAdmin} />}
      {tab === 'log' && <StatsPanel stats={stats} />}

      {disableOpen && (
        <Modal
          title="关闭全局防护"
          size="sm"
          onClose={() => (busy ? undefined : setDisableOpen(false))}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text">
              关闭后将<span className="text-crit"> 整体卸下防护</span>:即便存在启用的 IP /
              URL / UA / CC 规则,生成的配置也<span className="text-crit">不会拦截任何请求</span>。
            </p>
            <p className="text-xs text-muted">此操作需在「生成并应用」后才在 nginx 生效。</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="md" disabled={busy} onClick={() => setDisableOpen(false)}>
                取消
              </Button>
              <Button
                size="md"
                disabled={busy || !isAdmin}
                onClick={async () => {
                  await toggleGlobal(false)
                  setDisableOpen(false)
                }}
              >
                确认关闭
              </Button>
            </div>
          </div>
        </Modal>
      )}

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
    </InstallGate>
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
  const [sub, setSub] = useState<'ip' | 'match'>('ip')
  const [query, setQuery] = useState('')
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

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

  // 单条规则启停:乐观更新本地状态,失败回滚。
  async function toggleIP(r: IPRule, next: boolean) {
    if (!isAdmin || busy) return
    setBusy(true)
    setFeedback(null)
    setIp((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: next } : x)))
    try {
      await apiFetch(`/api/m/waf/ip/${r.id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: next }),
      })
    } catch (e) {
      setIp((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: r.enabled } : x)))
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function toggleMatch(r: MatchRule, next: boolean) {
    if (!isAdmin || busy) return
    setBusy(true)
    setFeedback(null)
    setMatch((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: next } : x)))
    try {
      await apiFetch(`/api/m/waf/match/${r.id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: next }),
      })
    } catch (e) {
      setMatch((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: r.enabled } : x)))
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
        cell: (r) => (
          <Switch
            checked={r.enabled}
            onChange={(next) => void toggleIP(r, next)}
            disabled={!isAdmin || busy}
            aria-label={r.enabled ? '停用此 IP 规则' : '启用此 IP 规则'}
          />
        ),
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
        cell: (r) => (
          <Switch
            checked={r.enabled}
            onChange={(next) => void toggleMatch(r, next)}
            disabled={!isAdmin || busy}
            aria-label={r.enabled ? '停用此匹配规则' : '启用此匹配规则'}
          />
        ),
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

  const visibleIP = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ip
    return ip.filter(
      (r) =>
        r.cidr.toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q),
    )
  }, [ip, query])

  const visibleMatch = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return match
    return match.filter(
      (r) =>
        r.pattern.toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q),
    )
  }, [match, query])

  // 切 tab/搜索/每页条数变化或行数缩减时把当前页夹回有效范围,避免停在空页。
  const total = sub === 'ip' ? visibleIP.length : visibleMatch.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  const pageIP = useMemo(
    () => visibleIP.slice(page * pageSize, page * pageSize + pageSize),
    [visibleIP, page, pageSize],
  )
  const pageMatch = useMemo(
    () => visibleMatch.slice(page * pageSize, page * pageSize + pageSize),
    [visibleMatch, page, pageSize],
  )

  return (
    <div className="flex flex-col gap-4">
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

      {/* 规则面板:计数 tab + 内嵌工具栏 + 紧凑规则表,对齐 aaPanel */}
      <Card className="flex flex-col gap-0 p-0">
        <Tabs
          className="px-2"
          tabs={[
            { key: 'ip' as const, label: tabLabel('IP 规则', ip.length) },
            { key: 'match' as const, label: tabLabel('URL / UA 规则', match.length) },
          ]}
          active={sub}
          onChange={(k) => {
            setSub(k)
            setQuery('')
            setPage(0)
          }}
        />

        {/* 工具栏:左添加规则,右搜索/刷新 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5">
          {sub === 'ip' ? (
            <Button size="sm" disabled={!isAdmin} onClick={() => setIpOpen(true)}>
              <Plus size={15} />
              添加 IP 规则
            </Button>
          ) : (
            <Button size="sm" disabled={!isAdmin} onClick={() => setMatchOpen(true)}>
              <Plus size={15} />
              添加匹配规则
            </Button>
          )}
          <div className="flex items-center gap-2">
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
                placeholder={sub === 'ip' ? '搜索 IP / 备注' : '搜索规则 / 备注'}
                spellCheck={false}
                className="h-9 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw size={15} />
              刷新
            </Button>
          </div>
        </div>

        {/* 紧凑规则表(去外框,贴合面板) */}
        {loading ? (
          <div className="h-48 animate-pulse" />
        ) : sub === 'ip' ? (
          <Table
            bare
            columns={ipColumns}
            rows={pageIP}
            rowKey={(r) => r.id}
            emptyText={
              <EmptyState
                icon={<ShieldCheck />}
                title={ip.length === 0 ? '还没有 IP 规则' : '没有匹配的规则'}
                hint={ip.length === 0 ? '添加允许 / 拒绝的 IP 或 CIDR 网段。' : '换个关键词试试。'}
              />
            }
          />
        ) : (
          <Table
            bare
            columns={matchColumns}
            rows={pageMatch}
            rowKey={(r) => r.id}
            emptyText={
              <EmptyState
                icon={<ShieldAlert />}
                title={match.length === 0 ? '还没有匹配规则' : '没有匹配的规则'}
                hint={
                  match.length === 0 ? '按请求 URI 或 User-Agent 的正则拦截 / 放行。' : '换个关键词试试。'
                }
              />
            }
          />
        )}

        {/* 底部分页:对齐 Sites,共 N 条 + 每页条数 + 翻页 */}
        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-3 py-2.5 text-xs text-muted">
            <span className="tabular-nums">共 {total} 条</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(0)
              }}
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
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              />
              <span className="tabular-nums px-1">
                {page + 1} / {pageCount}
              </span>
              <IconButton
                aria-label="下一页"
                className="h-8 w-8"
                disabled={page >= pageCount - 1}
                icon={<ChevronRight size={16} />}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              />
            </div>
          </div>
        )}
      </Card>

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
