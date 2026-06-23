import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, ShieldCheck, ShieldOff, Network, Wifi } from 'lucide-react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Tabs } from '../components/Tabs'
import { Badge } from '../components/Badge'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { InstallGate } from '../components/InstallGate'
import { uid } from '../lib/uid'

const DANGER = { 'X-Confirm-Danger': '1' }

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

type Action = 'allow' | 'deny'
type Proto = 'tcp' | 'udp'
type IPAction = 'block' | 'trust'
type Tab = 'port' | 'ip'

// 后端 PortRule.port 为字符串,支持单端口或区间(如 "8000-9000")。
interface PortRule {
  action: string
  port: string
  proto: string
  source: string
  comment: string
}

interface Status {
  backend: string
  running: boolean
  ruleCount: number
  sshPort: number
}

// 后端无 IP 规则列表端点,IP 规则为只写。本地镜像本会话内添加的条目以填充表格。
// id 仅用于 React key 与本地删除定位,不传后端。
interface IPRow {
  id: string
  action: IPAction
  ip: string
  comment: string
}

// 端口规范:单端口或区间。后端 PortRule 同样校验,这里只做前端即时提示。
const PORT_SPEC = /^\d{1,5}(-\d{1,5})?$/

function validPortSpec(spec: string): boolean {
  if (!PORT_SPEC.test(spec)) return false
  const parts = spec.split('-').map(Number)
  return parts.every((n) => n >= 1 && n <= 65535) && (parts.length === 1 || parts[0] <= parts[1])
}

// 简易 IP/CIDR 校验,仅前端即时提示;后端做权威校验。
function validIP(s: string): boolean {
  const v = s.trim()
  if (!v) return false
  const [addr, cidr] = v.split('/')
  if (cidr !== undefined && !/^\d{1,3}$/.test(cidr)) return false
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/
  return v4.test(addr) || addr.includes(':')
}

// tab 标签带计数,对齐 aaPanel「端口规则: N / IP 规则: N」。
function tabLabel(text: string, count: number) {
  return (
    <span className="flex items-center gap-1.5">
      {text}
      <span className="font-[family-name:var(--font-mono)] text-xs text-faint">{count}</span>
    </span>
  )
}

/** Firewall 防火墙:aaPanel 安全/防火墙页骨架 —— 顶部状态开关条 + 端口/IP 计数 tab + 紧凑规则表(工具栏内嵌)。 */
export default function Firewall() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [tab, setTab] = useState<Tab>('port')
  const [status, setStatus] = useState<Status | null>(null)
  const [rules, setRules] = useState<PortRule[]>([])
  const [ipRows, setIPRows] = useState<IPRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [query, setQuery] = useState('')

  const [portModal, setPortModal] = useState(false)
  const [ipModal, setIPModal] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [st, r] = await Promise.all([
        apiFetch<Status>('/api/m/firewall/status'),
        apiFetch<PortRule[]>('/api/m/firewall/rules'),
      ])
      setStatus(st)
      setRules(Array.isArray(r) ? r : [])
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function flash(kind: 'ok' | 'err', text: string) {
    setFeedback({ kind, text })
  }

  async function addPort(form: PortRule) {
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/firewall/rules', { method: 'POST', body: JSON.stringify(form) })
      flash('ok', '规则已添加')
      setPortModal(false)
      await load()
    } catch (e) {
      flash('err', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function delPort(rule: PortRule) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除规则 ${rule.action} ${rule.proto}/${rule.port}?此操作危险。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/firewall/rules', {
        method: 'DELETE',
        headers: DANGER,
        body: JSON.stringify(rule),
      })
      flash('ok', '规则已删除')
      await load()
    } catch (e) {
      flash('err', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  // 封禁属危险操作需二次确认,信任仅需 admin。成功后镜像到本地列表(后端无列表端点)。
  async function addIP(action: IPAction, ip: string, comment: string) {
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/firewall/ip', {
        method: 'POST',
        headers: action === 'block' ? DANGER : undefined,
        body: JSON.stringify({ action, ip }),
      })
      setIPRows((prev) => [{ id: uid(), action, ip, comment }, ...prev])
      flash('ok', action === 'block' ? 'IP 已封禁' : 'IP 已信任')
      setIPModal(false)
    } catch (e) {
      flash('err', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function delIP(row: IPRow) {
    if (!isAdmin) return
    if (!window.confirm(`确认移除 ${row.action === 'block' ? '封禁' : '信任'} ${row.ip}?此操作危险。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/firewall/ip', {
        method: 'DELETE',
        headers: DANGER,
        body: JSON.stringify({ action: row.action, ip: row.ip }),
      })
      setIPRows((prev) => prev.filter((r) => r.id !== row.id))
      flash('ok', '已移除 IP 规则')
    } catch (e) {
      flash('err', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function setPing(allow: boolean) {
    if (!isAdmin || busy) return
    if (!allow && !window.confirm('确认禁止 ping(屏蔽 ICMP)?')) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/firewall/ping', {
        method: 'POST',
        headers: allow ? undefined : DANGER,
        body: JSON.stringify({ allow }),
      })
      flash('ok', allow ? '已允许 ping' : '已禁止 ping')
    } catch (e) {
      flash('err', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function setEnabled(enable: boolean) {
    if (!isAdmin || busy) return
    if (!enable && !window.confirm('确认禁用防火墙?这将清除当前保护,此操作危险。')) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/firewall/${enable ? 'enable' : 'disable'}`, {
        method: 'POST',
        headers: enable ? undefined : DANGER,
      })
      flash('ok', enable ? '防火墙已启用' : '防火墙已禁用')
      await load()
    } catch (e) {
      flash('err', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const backend = status?.backend ?? ''
  const running = status?.running ?? false
  const sshPort = status?.sshPort ?? 0

  const visiblePorts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rules
    return rules.filter(
      (r) =>
        r.port.includes(q) ||
        r.proto.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q),
    )
  }, [rules, query])

  const visibleIPs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ipRows
    return ipRows.filter((r) => r.ip.toLowerCase().includes(q) || r.comment.toLowerCase().includes(q))
  }, [ipRows, query])

  const portColumns: Column<PortRule>[] = useMemo(
    () => [
      {
        key: 'proto',
        header: '协议',
        width: '72px',
        cell: (r) => <span className="font-[family-name:var(--font-mono)] uppercase text-muted">{r.proto}</span>,
      },
      {
        key: 'port',
        header: '端口',
        width: '120px',
        cell: (r) => <span className="font-[family-name:var(--font-mono)] text-text">{r.port}</span>,
      },
      {
        key: 'source',
        header: '来源',
        cell: (r) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted">{r.source || '全部'}</span>
        ),
      },
      {
        key: 'action',
        header: '策略',
        width: '88px',
        cell: (r) => (
          <Badge status={r.action === 'allow' ? 'online' : 'crit'}>
            {r.action === 'allow' ? '允许' : '拒绝'}
          </Badge>
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
        width: '80px',
        align: 'right',
        cell: (r) => (
          <ActionLinks>
            <ActionLink
              danger
              disabled={!isAdmin}
              title={isAdmin ? '删除规则' : '需要 admin 角色'}
              onClick={() => void delPort(r)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin],
  )

  const ipColumns: Column<IPRow>[] = useMemo(
    () => [
      {
        key: 'ip',
        header: '源 IP / CIDR',
        cell: (r) => <span className="font-[family-name:var(--font-mono)] text-text">{r.ip}</span>,
      },
      {
        key: 'action',
        header: '策略',
        width: '88px',
        cell: (r) => (
          <Badge status={r.action === 'block' ? 'crit' : 'online'}>
            {r.action === 'block' ? '封禁' : '信任'}
          </Badge>
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
        width: '80px',
        align: 'right',
        cell: (r) => (
          <ActionLinks>
            <ActionLink
              danger
              disabled={!isAdmin}
              title={isAdmin ? '移除规则' : '需要 admin 角色'}
              onClick={() => void delIP(r)}
            >
              移除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin],
  )

  return (
    <InstallGate moduleId="firewall">
    <div className="flex flex-col gap-3">
      {/* 顶部状态开关条:对齐 aaPanel —— 左侧防火墙/ICMP 开关,右侧后端 + SSH 端口元信息 */}
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 py-3">
        <label className="flex items-center gap-2.5">
          {running ? (
            <ShieldCheck size={16} className="text-online" />
          ) : (
            <ShieldOff size={16} className="text-muted" />
          )}
          <span className="text-sm text-text">开启防火墙</span>
          <Switch
            checked={running}
            disabled={!isAdmin || busy}
            aria-label="开启防火墙"
            onChange={(next) => void setEnabled(next)}
          />
        </label>
        <label className="flex items-center gap-2.5">
          <Wifi size={16} className="text-warn" />
          <span className="text-sm text-text">屏蔽 Ping</span>
          <Switch
            checked={false}
            disabled={!isAdmin || busy}
            aria-label="屏蔽 ping"
            onChange={(next) => void setPing(!next)}
          />
        </label>
        <div className="ml-auto flex items-center gap-x-6 gap-y-2">
          {busy && <Spinner size={16} />}
          <div className="flex items-center gap-2">
            <Network size={15} className="text-warn" />
            <span className="text-sm text-muted">后端</span>
            {backend ? <Badge status="online">{backend}</Badge> : <Badge status="neutral">未检测到</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">SSH 端口</span>
            <span className="font-[family-name:var(--font-mono)] text-sm text-text">{sshPort || '22'}</span>
          </div>
        </div>
      </Card>

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{feedback.text}</p>
      )}
      {!isAdmin && <p className="text-xs text-muted">规则与启停操作需要 admin 角色。</p>}

      {loadErr && rules.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      {/* 规则面板:计数 tab + 内嵌工具栏 + 紧凑规则表,对齐 aaPanel */}
      <Card className="flex flex-col gap-0 p-0">
        {/* 计数 tab */}
        <Tabs
          className="px-2"
          tabs={[
            { key: 'port' as Tab, label: tabLabel('端口规则', rules.length) },
            { key: 'ip' as Tab, label: tabLabel('IP 规则', ipRows.length) },
          ]}
          active={tab}
          onChange={(k) => {
            setTab(k)
            setQuery('')
          }}
        />

        {/* 工具栏:左添加规则,右搜索/刷新 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            {tab === 'port' ? (
              <Button size="sm" disabled={!isAdmin} onClick={() => setPortModal(true)}>
                <Plus size={15} />
                添加端口规则
              </Button>
            ) : (
              <Button size="sm" disabled={!isAdmin} onClick={() => setIPModal(true)}>
                <Plus size={15} />
                添加 IP 规则
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === 'port' ? '搜索端口 / 来源 / 备注' : '搜索 IP / 备注'}
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
        ) : tab === 'port' ? (
          <Table
            bare
            columns={portColumns}
            rows={visiblePorts}
            rowKey={(r) => `${r.action}-${r.proto}-${r.port}-${r.source}`}
            emptyText={
              <EmptyState
                icon={<ShieldCheck />}
                title={rules.length === 0 ? '还没有端口规则' : '没有匹配的规则'}
                hint={rules.length === 0 ? '点击「添加端口规则」添加第一条规则。' : '换个关键词试试。'}
              />
            }
          />
        ) : (
          <Table
            bare
            columns={ipColumns}
            rows={visibleIPs}
            rowKey={(r) => r.id}
            emptyText={
              <EmptyState
                icon={<ShieldCheck />}
                title={ipRows.length === 0 ? '本会话还没有 IP 规则' : '没有匹配的规则'}
                hint={
                  ipRows.length === 0
                    ? '后端不提供 IP 规则列表,此处仅展示本次添加的条目。'
                    : '换个关键词试试。'
                }
              />
            }
          />
        )}
      </Card>

      {portModal && (
        <PortModal busy={busy} onClose={() => setPortModal(false)} onSubmit={addPort} />
      )}
      {ipModal && <IPModal busy={busy} onClose={() => setIPModal(false)} onSubmit={addIP} />}
    </div>
    </InstallGate>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

const selectClass =
  'h-10 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

function PortModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean
  onClose: () => void
  onSubmit: (form: PortRule) => Promise<void>
}) {
  const [action, setAction] = useState<Action>('allow')
  const [port, setPort] = useState('')
  const [proto, setProto] = useState<Proto>('tcp')
  const [source, setSource] = useState('')
  const [comment, setComment] = useState('')

  const portOk = validPortSpec(port.trim())
  const canSubmit = portOk && !busy

  function submit() {
    if (!canSubmit) return
    void onSubmit({
      action,
      port: port.trim(),
      proto,
      source: source.trim(),
      comment: comment.trim(),
    })
  }

  return (
    <Modal title="放行端口" size="sm" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="策略">
            <select value={action} onChange={(e) => setAction(e.target.value as Action)} className={selectClass}>
              <option value="allow">允许 allow</option>
              <option value="deny">拒绝 deny</option>
            </select>
          </Field>
          <Field label="协议">
            <select value={proto} onChange={(e) => setProto(e.target.value as Proto)} className={selectClass}>
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
            </select>
          </Field>
        </div>
        <Input
          label="端口"
          placeholder="80 或 8000-9000"
          autoFocus
          spellCheck={false}
          value={port}
          error={port.length > 0 && !portOk ? '端口需为 1–65535,或区间如 8000-9000' : undefined}
          onChange={(e) => setPort(e.target.value)}
        />
        <Input
          label="来源 IP / CIDR(留空为任意)"
          placeholder="如 192.168.1.0/24"
          spellCheck={false}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <Input
          label="备注(可选)"
          placeholder="备注"
          spellCheck={false}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? '处理中…' : '确定'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function IPModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean
  onClose: () => void
  onSubmit: (action: IPAction, ip: string, comment: string) => Promise<void>
}) {
  const [action, setAction] = useState<IPAction>('block')
  const [ip, setIP] = useState('')
  const [comment, setComment] = useState('')

  const ipOk = validIP(ip)
  const canSubmit = ipOk && !busy

  function submit() {
    if (!canSubmit) return
    void onSubmit(action, ip.trim(), comment.trim())
  }

  return (
    <Modal title="添加 IP 规则" size="sm" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="策略">
          <select value={action} onChange={(e) => setAction(e.target.value as IPAction)} className={selectClass}>
            <option value="block">封禁 block</option>
            <option value="trust">信任 trust</option>
          </select>
        </Field>
        <Input
          label="IP / CIDR"
          placeholder="如 1.2.3.4 或 10.0.0.0/8"
          autoFocus
          spellCheck={false}
          value={ip}
          error={ip.length > 0 && !ipOk ? '请输入有效的 IP 或 CIDR' : undefined}
          onChange={(e) => setIP(e.target.value)}
        />
        <Input
          label="备注(可选)"
          placeholder="备注"
          spellCheck={false}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <p className="text-xs text-muted">封禁为危险操作,会要求二次确认。</p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? '处理中…' : '确定'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
