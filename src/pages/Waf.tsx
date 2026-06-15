import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

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

/** Waf 应用防火墙:IP 黑白名单、URL/UA 规则、CC 防御阈值、配置预览与 apply、拦截统计。 */
export default function Waf() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  return (
    <div className="flex flex-col gap-4">
      <StatsAndApply isAdmin={isAdmin} />
      <IPRules isAdmin={isAdmin} />
      <MatchRules isAdmin={isAdmin} />
      <CC isAdmin={isAdmin} />
      <ConfigPreview />
    </div>
  )
}

function StatsAndApply({ isAdmin }: { isAdmin: boolean }) {
  const [stats, setStats] = useState<WafStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    try {
      setStats(await apiFetch<WafStats>('/api/m/waf/stats'))
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function apply() {
    if (!window.confirm('确认生成 WAF 配置并重载 nginx?校验失败会自动回滚。')) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/waf/apply', { method: 'POST' })
      setFeedback({ kind: 'ok', text: '已应用并重载 nginx' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text">拦截统计</h2>
        <div className="flex items-center gap-2">
          {busy && <Spinner size={16} />}
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
          <Button
            size="sm"
            onClick={() => void apply()}
            disabled={!isAdmin || busy}
            title={isAdmin ? undefined : '需要 admin 角色'}
          >
            生成并应用
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="flex h-16 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="扫描行数" value={stats.total} />
          <Metric label="已拦截 (403/444)" value={stats.blocked} />
          <Metric label="已限流 (429/503)" value={stats.limited} />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">日志文件</span>
            <Badge status={stats.log_exists ? 'online' : 'warn'}>
              {stats.log_exists ? '存在' : '缺失'}
            </Badge>
          </div>
        </div>
      ) : null}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-[family-name:var(--font-mono)] text-xl font-semibold text-text">
        {value.toLocaleString()}
      </span>
    </div>
  )
}

function IPRules({ isAdmin }: { isAdmin: boolean }) {
  const [rules, setRules] = useState<IPRule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState({ action: 'deny' as 'allow' | 'deny', cidr: '', comment: '', enabled: true })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setRules(await apiFetch<IPRule[]>('/api/m/waf/ip'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const canAdd = form.cidr.trim().length > 0 && isAdmin && !busy

  async function add() {
    if (!canAdd) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/waf/ip', {
        method: 'POST',
        body: JSON.stringify({
          action: form.action,
          cidr: form.cidr.trim(),
          comment: form.comment.trim(),
          enabled: form.enabled,
        }),
      })
      setFeedback({ kind: 'ok', text: 'IP 规则已添加' })
      setForm((f) => ({ ...f, cidr: '', comment: '' }))
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(r: IPRule) {
    if (!window.confirm(`确认删除 IP 规则 ${r.action} ${r.cidr}?`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/waf/ip/${r.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">IP 黑白名单</h2>
      <div className="grid gap-3 sm:grid-cols-4">
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
        <div className="flex items-end gap-2">
          <Button onClick={() => void add()} disabled={!canAdd}>
            添加
          </Button>
          {busy && <Spinner size={16} />}
        </div>
      </div>
      {!isAdmin && <p className="text-xs text-muted">写操作需要 admin 角色。</p>}
      <RuleList
        loading={loading}
        loadErr={loadErr}
        empty={rules.length === 0}
        rows={rules.map((r) => ({
          id: r.id,
          left: (
            <>
              <Badge status={r.action === 'deny' ? 'crit' : 'online'}>{r.action}</Badge>
              <span className="font-[family-name:var(--font-mono)] text-sm text-text">{r.cidr}</span>
            </>
          ),
          comment: r.comment,
          enabled: r.enabled,
          onRemove: () => void remove(r),
        }))}
        canRemove={isAdmin && !busy}
      />
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function MatchRules({ isAdmin }: { isAdmin: boolean }) {
  const [rules, setRules] = useState<MatchRule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    target: 'uri' as 'uri' | 'ua',
    pattern: '',
    action: 'block' as 'block' | 'allow',
    comment: '',
    enabled: true,
  })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setRules(await apiFetch<MatchRule[]>('/api/m/waf/match'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const canAdd = form.pattern.trim().length > 0 && form.pattern.length <= 512 && isAdmin && !busy

  async function add() {
    if (!canAdd) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/waf/match', {
        method: 'POST',
        body: JSON.stringify({
          target: form.target,
          pattern: form.pattern,
          action: form.action,
          comment: form.comment.trim(),
          enabled: form.enabled,
        }),
      })
      setFeedback({ kind: 'ok', text: '规则已添加' })
      setForm((f) => ({ ...f, pattern: '', comment: '' }))
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(r: MatchRule) {
    if (!window.confirm(`确认删除规则 ${r.target} ${r.pattern}?`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/waf/match/${r.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">URL / UA 规则</h2>
      <div className="grid gap-3 sm:grid-cols-4">
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
        <Input
          label="正则 pattern"
          placeholder="例如 \.(php|jsp)$"
          value={form.pattern}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          error={form.pattern.length > 512 ? '最长 512 字符' : undefined}
          className="font-[family-name:var(--font-mono)]"
          onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
        />
        <div className="flex items-end gap-2">
          <Button onClick={() => void add()} disabled={!canAdd}>
            添加
          </Button>
          {busy && <Spinner size={16} />}
        </div>
      </div>
      <Input
        label="备注"
        placeholder="可选"
        value={form.comment}
        onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
      />
      {!isAdmin && <p className="text-xs text-muted">写操作需要 admin 角色。</p>}
      <RuleList
        loading={loading}
        loadErr={loadErr}
        empty={rules.length === 0}
        rows={rules.map((r) => ({
          id: r.id,
          left: (
            <>
              <Badge status="neutral">{r.target}</Badge>
              <Badge status={r.action === 'block' ? 'crit' : 'online'}>{r.action}</Badge>
              <span className="truncate font-[family-name:var(--font-mono)] text-sm text-text">
                {r.pattern}
              </span>
            </>
          ),
          comment: r.comment,
          enabled: r.enabled,
          onRemove: () => void remove(r),
        }))}
        canRemove={isAdmin && !busy}
      />
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

interface RuleRow {
  id: number
  left: React.ReactNode
  comment: string
  enabled: boolean
  onRemove: () => void
}

function RuleList({
  loading,
  loadErr,
  empty,
  rows,
  canRemove,
}: {
  loading: boolean
  loadErr: string | null
  empty: boolean
  rows: RuleRow[]
  canRemove: boolean
}) {
  if (loading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }
  if (loadErr && empty) return <p className="text-sm text-muted">{loadErr}</p>
  if (empty) return <p className="text-sm text-muted">暂无规则。</p>
  return (
    <div className="divide-y divide-border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">{r.left}</div>
          {!r.enabled && <Badge status="warn">停用</Badge>}
          {r.comment && <span className="hidden truncate text-xs text-muted sm:block">{r.comment}</span>}
          <Button size="sm" variant="danger" onClick={r.onRemove} disabled={!canRemove}>
            删除
          </Button>
        </div>
      ))}
    </div>
  )
}

function CC({ isAdmin }: { isAdmin: boolean }) {
  const [cfg, setCfg] = useState<CCConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    try {
      setCfg(await apiFetch<CCConfig>('/api/m/waf/cc'))
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!cfg || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/waf/cc', { method: 'PUT', body: JSON.stringify(cfg) })
      setFeedback({ kind: 'ok', text: 'CC 防御已保存(apply 后生效)' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function num(key: keyof CCConfig) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setCfg((c) => (c ? { ...c, [key]: Number(e.target.value) || 0 } : c))
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text">CC 防御阈值</h2>
        {cfg && (
          <Switch
            checked={cfg.enabled}
            onChange={(next) => setCfg((c) => (c ? { ...c, enabled: next } : c))}
            disabled={!isAdmin || busy}
            aria-label="启用 CC 防御"
          />
        )}
      </div>
      {loading ? (
        <div className="flex h-16 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : cfg ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Input
              label="每秒请求 (1–100000)"
              inputMode="numeric"
              value={String(cfg.rate_per_sec)}
              onChange={num('rate_per_sec')}
            />
            <Input
              label="突发 burst (0–100000)"
              inputMode="numeric"
              value={String(cfg.burst)}
              onChange={num('burst')}
            />
            <Input
              label="单 IP 连接数 (0–100000)"
              inputMode="numeric"
              value={String(cfg.conn_per_ip)}
              onChange={num('conn_per_ip')}
            />
            <Input
              label="共享内存 MB (1–1024)"
              inputMode="numeric"
              value={String(cfg.zone_size_mb)}
              onChange={num('zone_size_mb')}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void save()} disabled={!isAdmin || busy}>
              保存
            </Button>
            {busy && <Spinner size={16} />}
            {!isAdmin && <span className="text-xs text-muted">写操作需要 admin 角色。</span>}
          </div>
        </>
      ) : null}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function ConfigPreview() {
  const [cfg, setCfg] = useState<WafConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

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
      {cfg && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{'http{}'} 段</span>
            <pre className="max-h-56 overflow-auto rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
              {cfg.http.trim() || '(空)'}
            </pre>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{'server{}'} 段</span>
            <pre className="max-h-56 overflow-auto rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
              {cfg.server.trim() || '(空)'}
            </pre>
          </div>
        </div>
      )}
    </Card>
  )
}
