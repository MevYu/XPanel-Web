import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Plus,
  Lock,
  ScrollText,
  Ban,
} from 'lucide-react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { uid } from '../lib/uid'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

// 改这些 sshd 指令可能把自己锁在门外,前端对应后端的危险键白名单,提交带确认头。
const SSHD_DANGER_KEYS = new Set([
  'Port',
  'PasswordAuthentication',
  'PermitRootLogin',
  'PubkeyAuthentication',
])

type Tab = 'sshd' | 'keys' | 'fail2ban' | 'logins'

const TABS: { key: Tab; label: string }[] = [
  { key: 'sshd', label: 'SSH 加固' },
  { key: 'keys', label: 'SSH 公钥' },
  { key: 'fail2ban', label: '防爆破' },
  { key: 'logins', label: '登录日志' },
]

interface SSHKey {
  id: number
  comment: string
  public_key: string
  created_by: number | null
  created_at: number
}

interface LoginEntry {
  user: string
  ip: string
  when: string
  failed: boolean
}

type Feedback = { kind: 'ok' | 'err'; text: string } | null

/** Security 主机安全:aaPanel 风格 —— 顶部 tab(SSH 加固 / 公钥 / 防爆破 / 登录日志),紧凑表格 + 固定尺寸弹窗。 */
export default function Security() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const [tab, setTab] = useState<Tab>('sshd')

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <p className="text-sm text-muted">主机安全管理需要 admin 角色。</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
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

      {tab === 'sshd' && <SSHHardening />}
      {tab === 'keys' && <SSHKeys />}
      {tab === 'fail2ban' && <Fail2ban />}
      {tab === 'logins' && <LoginLog />}
    </div>
  )
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  return (
    <p
      className={`flex items-center gap-2 rounded-(--radius-sm) border px-3 py-2 text-sm ${
        feedback.kind === 'ok'
          ? 'border-online/30 bg-online-soft text-online'
          : 'border-crit/30 bg-crit-soft text-crit'
      }`}
    >
      {feedback.text}
    </p>
  )
}

function SSHHardening() {
  const [directives, setDirectives] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setDirectives(await apiFetch<Record<string, string>>('/api/m/security/sshd'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(key: string, value: string) {
    const danger = SSHD_DANGER_KEYS.has(key)
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/security/sshd', {
        method: 'PUT',
        headers: danger ? DANGER : undefined,
        body: JSON.stringify({ key, value }),
      })
      setFeedback({ kind: 'ok', text: `${key} 已更新(reload 后生效)` })
      setEditing(null)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function reload() {
    if (!window.confirm('确认校验并重载 sshd?配置有误会被拒绝重载。')) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/security/sshd/reload', { method: 'POST' })
      setFeedback({ kind: 'ok', text: 'sshd 已重载' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const keys = useMemo(() => Object.keys(directives).sort(), [directives])
  const rows = useMemo(() => keys.map((key) => ({ key, value: directives[key] })), [keys, directives])

  const columns: Column<{ key: string; value: string }>[] = [
    {
      key: 'key',
      header: '指令',
      cell: (r) => (
        <span className="inline-flex items-center gap-2 font-[family-name:var(--font-mono)] text-text">
          {SSHD_DANGER_KEYS.has(r.key) ? (
            <ShieldAlert size={15} className="shrink-0 text-warn" />
          ) : (
            <Lock size={15} className="shrink-0 text-muted" />
          )}
          {r.key}
        </span>
      ),
    },
    {
      key: 'value',
      header: '当前值',
      cell: (r) => (
        <span className="font-[family-name:var(--font-mono)] text-xs text-muted">{r.value || '—'}</span>
      ),
    },
    {
      key: 'danger',
      header: '级别',
      width: '92px',
      cell: (r) =>
        SSHD_DANGER_KEYS.has(r.key) ? (
          <Badge status="warn">危险</Badge>
        ) : (
          <Badge status="neutral">常规</Badge>
        ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '90px',
      align: 'right',
      cell: (r) => (
        <ActionLinks>
          <ActionLink onClick={() => setEditing(r.key)} disabled={busy}>
            修改
          </ActionLink>
        </ActionLinks>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-online" />
          <span className="text-sm text-muted">sshd 白名单指令</span>
          <span className="font-[family-name:var(--font-mono)] text-sm text-text">{keys.length}</span>
        </div>
        <p className="text-xs text-muted">
          标「危险」的指令(端口、root 登录、密码/公钥认证)修改需二次确认。改完务必重载 sshd。
        </p>
        <div className="ml-auto flex items-center gap-2">
          {busy && <Spinner size={16} />}
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={14} />
            刷新
          </Button>
          <Button size="sm" onClick={() => void reload()} disabled={busy}>
            校验并重载 sshd
          </Button>
        </div>
      </Card>

      <FeedbackLine feedback={feedback} />

      {loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : loadErr ? (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      ) : (
        <Table
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">未读到可改写指令</span>
              <span className="text-xs text-muted">sshd 可能不可用,或配置无白名单内的指令。</span>
            </span>
          }
        />
      )}

      {editing && (
        <SSHDEditModal
          dkey={editing}
          value={directives[editing] ?? ''}
          danger={SSHD_DANGER_KEYS.has(editing)}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(v) => void save(editing, v)}
        />
      )}
    </div>
  )
}

function SSHDEditModal({
  dkey,
  value,
  danger,
  busy,
  onClose,
  onSave,
}: {
  dkey: string
  value: string
  danger: boolean
  busy: boolean
  onClose: () => void
  onSave: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const trimmed = draft.trim()
  const changed = trimmed !== value
  const canSubmit = changed && trimmed.length > 0 && !busy

  function submit() {
    if (!canSubmit) return
    if (
      danger &&
      !window.confirm(`修改 ${dkey} 可能影响你自己的登录,确认设为「${trimmed}」?此操作危险。`)
    ) {
      return
    }
    onSave(trimmed)
  }

  return (
    <Modal title={`修改 ${dkey}`} size="sm" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {danger && (
          <p className="flex items-start gap-2 rounded-(--radius-sm) border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" />
            该指令影响登录方式,改错可能将你锁在门外。保存需二次确认,改完务必重载 sshd。
          </p>
        )}
        <Input
          label={dkey}
          value={draft}
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={!canSubmit}>
            {busy ? '处理中…' : '保存'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function SSHKeys() {
  const [keys, setKeys] = useState<SSHKey[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setKeys(await apiFetch<SSHKey[]>('/api/m/security/keys'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add(comment: string, publicKey: string) {
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/security/keys', {
        method: 'POST',
        body: JSON.stringify({ comment, public_key: publicKey }),
      })
      setFeedback({ kind: 'ok', text: '公钥已添加' })
      setAdding(false)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(k: SSHKey) {
    if (!window.confirm(`确认删除公钥「${k.comment || k.id}」?对应客户端将无法再用它登录。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/security/keys/${k.id}`, { method: 'DELETE', headers: DANGER })
      setFeedback({ kind: 'ok', text: '公钥已删除' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<SSHKey>[] = [
    {
      key: 'comment',
      header: '备注',
      cell: (k) => (
        <span className="inline-flex items-center gap-2 font-medium text-text">
          <KeyRound size={15} className="shrink-0 text-muted" />
          <span className="truncate">{k.comment || '(无备注)'}</span>
        </span>
      ),
    },
    {
      key: 'public_key',
      header: '公钥',
      cell: (k) => (
        <span className="block max-w-[28rem] truncate font-[family-name:var(--font-mono)] text-xs text-muted">
          {k.public_key}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '80px',
      align: 'right',
      cell: (k) => (
        <ActionLinks>
          <ActionLink danger disabled={busy} aria-label="删除公钥" onClick={() => void remove(k)}>
            删除
          </ActionLink>
        </ActionLinks>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button size="md" onClick={() => setAdding(true)} disabled={busy}>
          <Plus size={15} />
          添加公钥
        </Button>
        <div className="flex items-center gap-2">
          {busy && <Spinner size={16} />}
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={14} />
            刷新
          </Button>
        </div>
      </div>

      <FeedbackLine feedback={feedback} />

      {loading ? (
        <div className="h-40 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : loadErr && keys.length === 0 ? (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      ) : (
        <Table
          columns={columns}
          rows={keys}
          rowKey={(k) => k.id}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">暂无已授权公钥</span>
              <span className="text-xs text-muted">点击「添加公钥」授权一个 SSH 客户端。</span>
            </span>
          }
        />
      )}

      {adding && <AddKeyModal busy={busy} onClose={() => setAdding(false)} onSubmit={add} />}
    </div>
  )
}

function AddKeyModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean
  onClose: () => void
  onSubmit: (comment: string, publicKey: string) => void
}) {
  const [comment, setComment] = useState('')
  const [pubkey, setPubkey] = useState('')
  const canSubmit = pubkey.trim().length > 0 && !busy

  function submit() {
    if (!canSubmit) return
    onSubmit(comment.trim(), pubkey.trim())
  }

  return (
    <Modal title="添加 SSH 公钥" size="sm" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Input
          label="备注"
          placeholder="例如 我的工作站"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">公钥</span>
          <textarea
            value={pubkey}
            placeholder="ssh-ed25519 AAAA... comment"
            spellCheck={false}
            autoFocus
            rows={4}
            onChange={(e) => setPubkey(e.target.value)}
            className="rounded-(--radius-sm) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? '处理中…' : '添加'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Fail2ban() {
  const [jail, setJail] = useState('sshd')
  const [status, setStatus] = useState<string>('')
  const [banned, setBanned] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async (j: string) => {
    setLoading(true)
    setFeedback(null)
    try {
      const t = j.trim()
      const params = t ? `?jail=${encodeURIComponent(t)}` : ''
      const [st, bn] = await Promise.all([
        apiFetch<string>(`/api/m/security/fail2ban/status${params}`),
        t
          ? apiFetch<string[]>(`/api/m/security/fail2ban/banned?jail=${encodeURIComponent(t)}`)
          : Promise.resolve<string[]>([]),
      ])
      setStatus(typeof st === 'string' ? st : JSON.stringify(st, null, 2))
      setBanned(bn)
    } catch (e) {
      setStatus('')
      setBanned([])
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load('sshd')
  }, [load])

  async function unban(ip: string) {
    if (!window.confirm(`确认对 jail「${jail}」解封 ${ip}?该 IP 将重新被放行,此操作危险。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/security/fail2ban/unban', {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({ jail: jail.trim(), ip }),
      })
      setFeedback({ kind: 'ok', text: `${ip} 已解封` })
      await load(jail)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function setJailEnabled(enable: boolean) {
    if (!enable && !window.confirm(`确认停止 jail「${jail}」?停止后将不再拦截,此操作危险。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/security/fail2ban/jail', {
        method: 'POST',
        headers: enable ? undefined : DANGER,
        body: JSON.stringify({ jail: jail.trim(), enable }),
      })
      setFeedback({ kind: 'ok', text: enable ? 'jail 已启动' : 'jail 已停止' })
      await load(jail)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const bannedRows = useMemo(() => banned.map((ip) => ({ id: uid(), ip })), [banned])

  const columns: Column<{ id: string; ip: string }>[] = [
    {
      key: 'ip',
      header: '被封 IP',
      cell: (r) => (
        <span className="inline-flex items-center gap-2 font-[family-name:var(--font-mono)] text-sm text-text">
          <Ban size={15} className="shrink-0 text-crit" />
          {r.ip}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '80px',
      align: 'right',
      cell: (r) => (
        <ActionLinks>
          <ActionLink danger disabled={busy} onClick={() => void unban(r.ip)}>
            解封
          </ActionLink>
        </ActionLinks>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-3">
        <Input
          label="Jail"
          placeholder="例如 sshd"
          value={jail}
          spellCheck={false}
          autoCapitalize="off"
          className="w-44"
          onChange={(e) => setJail(e.target.value)}
        />
        <Button size="md" variant="ghost" onClick={() => void load(jail)} disabled={loading || busy}>
          <RefreshCw size={14} />
          查询
        </Button>
        <Button size="md" onClick={() => void setJailEnabled(true)} disabled={busy || !jail.trim()}>
          启动 jail
        </Button>
        <Button
          size="md"
          variant="danger"
          onClick={() => void setJailEnabled(false)}
          disabled={busy || !jail.trim()}
        >
          停止 jail
        </Button>
        {(loading || busy) && <Spinner size={16} />}
      </Card>

      <FeedbackLine feedback={feedback} />

      <Card className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">状态</span>
        <pre className="max-h-56 overflow-auto rounded-(--radius-sm) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed whitespace-pre-wrap text-text">
          {status.trim() || '无输出'}
        </pre>
      </Card>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">封禁 IP（{banned.length}）</span>
        <Table
          columns={columns}
          rows={bannedRows}
          rowKey={(r) => r.id}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">该 jail 当前无封禁 IP</span>
              <span className="text-xs text-muted">爆破触发封禁后会出现在这里,可逐条解封。</span>
            </span>
          }
        />
      </div>
    </div>
  )
}

function LoginLog() {
  const [entries, setEntries] = useState<LoginEntry[]>([])
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const load = useCallback(async (showFailed: boolean) => {
    setLoading(true)
    setLoadErr(null)
    try {
      setEntries(
        await apiFetch<LoginEntry[]>(`/api/m/security/logins?failed=${showFailed}&limit=50`),
      )
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(failed)
  }, [load, failed])

  const rows = useMemo(() => entries.map((e) => ({ id: uid(), ...e })), [entries])

  const columns: Column<{ id: string } & LoginEntry>[] = [
    {
      key: 'when',
      header: '时间',
      width: '180px',
      cell: (e) => <span className="text-xs text-muted">{e.when || '—'}</span>,
    },
    {
      key: 'ip',
      header: 'IP',
      cell: (e) => (
        <span className="font-[family-name:var(--font-mono)] text-xs text-muted">{e.ip || '—'}</span>
      ),
    },
    {
      key: 'user',
      header: '用户',
      width: '160px',
      cell: (e) => <span className="truncate text-sm text-text">{e.user || '—'}</span>,
    },
    {
      key: 'result',
      header: '结果',
      width: '100px',
      align: 'right',
      cell: (e) => (
        <Badge status={e.failed ? 'crit' : 'online'}>{e.failed ? '失败' : '成功'}</Badge>
      ),
    },
  ]

  const filters: { key: boolean; label: ReactNode }[] = [
    { key: false, label: '成功' },
    { key: true, label: '失败' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted">
          <ScrollText size={15} className="text-warn" />
          最近 50 条{failed ? '失败' : '成功'}登录
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-(--radius-sm) border border-border bg-surface p-0.5">
            {filters.map((f) => (
              <button
                key={String(f.key)}
                onClick={() => setFailed(f.key)}
                className={`h-9 rounded-sm px-4 text-[13px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                  failed === f.key ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2/60 hover:text-text'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => void load(failed)} disabled={loading}>
            <RefreshCw size={14} />
            刷新
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : loadErr ? (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load(failed)}>
            重试
          </Button>
        </p>
      ) : (
        <Table
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">暂无记录</span>
              <span className="text-xs text-muted">
                {failed ? '近期没有失败登录尝试。' : '近期没有成功登录记录。'}
              </span>
            </span>
          }
        />
      )}
    </div>
  )
}
