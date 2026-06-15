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

const DANGER = { 'X-Confirm-Danger': '1' }

// 改这些 sshd 指令可能把自己锁在门外,前端对应后端的危险键白名单,提交前二次确认。
const SSHD_DANGER_KEYS = new Set([
  'Port',
  'PasswordAuthentication',
  'PermitRootLogin',
  'PubkeyAuthentication',
])

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

/** Security 主机安全:SSH 加固指令编辑与 reload、公钥增删、fail2ban 状态/封禁/解封、登录日志。 */
export default function Security() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  if (!isAdmin) {
    return (
      <Card>
        <p className="text-sm text-muted">主机安全管理需要 admin 角色。</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <SSHHardening />
      <SSHKeys />
      <Fail2ban />
      <LoginLog />
    </div>
  )
}

function SSHHardening() {
  const [directives, setDirectives] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const d = await apiFetch<Record<string, string>>('/api/m/security/sshd')
      setDirectives(d)
      setDraft(d)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(key: string) {
    const value = (draft[key] ?? '').trim()
    if (value === directives[key]) return
    const danger = SSHD_DANGER_KEYS.has(key)
    if (
      danger &&
      !window.confirm(`修改 ${key} 可能影响你自己的登录,确认设为「${value}」?此操作危险。`)
    ) {
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/security/sshd', {
        method: 'PUT',
        headers: danger ? DANGER : undefined,
        body: JSON.stringify({ key, value }),
      })
      setFeedback({ kind: 'ok', text: `${key} 已更新(reload 后生效)` })
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

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text">SSH 加固</h2>
        <div className="flex items-center gap-2">
          {busy && <Spinner size={16} />}
          <Button size="sm" onClick={() => void reload()} disabled={busy}>
            校验并重载 sshd
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : loadErr ? (
        <p className="text-sm text-muted">{loadErr}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.keys(directives).map((key) => {
            const changed = (draft[key] ?? '') !== directives[key]
            return (
              <div key={key} className="flex items-end gap-2">
                <Input
                  label={key}
                  value={draft[key] ?? ''}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="font-[family-name:var(--font-mono)]"
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant={SSHD_DANGER_KEYS.has(key) ? 'danger' : 'primary'}
                  onClick={() => void save(key)}
                  disabled={!changed || busy}
                >
                  保存
                </Button>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-muted">
        标红保存按钮的指令为危险项(端口、root 登录、密码/公钥认证),修改需二次确认。改完务必重载 sshd。
      </p>
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function SSHKeys() {
  const [keys, setKeys] = useState<SSHKey[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [pubkey, setPubkey] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

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

  const canAdd = pubkey.trim().length > 0 && !busy

  async function add() {
    if (!canAdd) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/security/keys', {
        method: 'POST',
        body: JSON.stringify({ comment: comment.trim(), public_key: pubkey.trim() }),
      })
      setFeedback({ kind: 'ok', text: '公钥已添加' })
      setComment('')
      setPubkey('')
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

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">SSH 公钥</h2>
      <div className="flex flex-col gap-3">
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
            rows={3}
            onChange={(e) => setPubkey(e.target.value)}
            className="rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          />
        </label>
        <div className="flex items-center gap-2">
          <Button onClick={() => void add()} disabled={!canAdd}>
            添加公钥
          </Button>
          {busy && <Spinner size={16} />}
        </div>
      </div>
      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : loadErr && keys.length === 0 ? (
        <p className="text-sm text-muted">{loadErr}</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted">暂无已授权公钥。</p>
      ) : (
        <div className="divide-y divide-border">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-medium text-text">{k.comment || '(无备注)'}</span>
                <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                  {k.public_key}
                </span>
              </div>
              <Button size="sm" variant="danger" onClick={() => void remove(k)} disabled={busy}>
                删除
              </Button>
            </div>
          ))}
        </div>
      )}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function Fail2ban() {
  const [jail, setJail] = useState('sshd')
  const [status, setStatus] = useState<string>('')
  const [banned, setBanned] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async (j: string) => {
    setLoading(true)
    setFeedback(null)
    try {
      const params = j.trim() ? `?jail=${encodeURIComponent(j.trim())}` : ''
      const [st, bn] = await Promise.all([
        apiFetch<string>(`/api/m/security/fail2ban/status${params}`),
        j.trim()
          ? apiFetch<string[]>(`/api/m/security/fail2ban/banned?jail=${encodeURIComponent(j.trim())}`)
          : Promise.resolve<string[]>([]),
      ])
      setStatus(typeof st === 'string' ? st : JSON.stringify(st, null, 2))
      setBanned(bn)
    } catch (e) {
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

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">fail2ban</h2>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="Jail"
          placeholder="例如 sshd"
          value={jail}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => setJail(e.target.value)}
        />
        <Button size="sm" variant="ghost" onClick={() => void load(jail)} disabled={loading || busy}>
          查询
        </Button>
        <Button size="sm" onClick={() => void setJailEnabled(true)} disabled={busy || !jail.trim()}>
          启动 jail
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => void setJailEnabled(false)}
          disabled={busy || !jail.trim()}
        >
          停止 jail
        </Button>
        {(loading || busy) && <Spinner size={16} />}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">状态</span>
        <pre className="max-h-56 overflow-auto rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
          {status.trim() || '无输出'}
        </pre>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">封禁 IP({banned.length})</span>
        {banned.length === 0 ? (
          <p className="text-sm text-muted">该 jail 当前无封禁 IP。</p>
        ) : (
          <div className="divide-y divide-border">
            {banned.map((ip) => (
              <div key={ip} className="flex items-center gap-4 py-2.5">
                <span className="flex-1 font-[family-name:var(--font-mono)] text-sm text-text">{ip}</span>
                <Button size="sm" variant="danger" onClick={() => void unban(ip)} disabled={busy}>
                  解封
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
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

  return (
    <Card className="flex flex-col gap-4 p-0">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="text-sm font-medium text-text">登录日志</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={failed ? 'ghost' : 'primary'} onClick={() => setFailed(false)}>
            成功
          </Button>
          <Button size="sm" variant={failed ? 'primary' : 'ghost'} onClick={() => setFailed(true)}>
            失败
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : loadErr ? (
        <p className="px-5 pb-5 text-sm text-muted">{loadErr}</p>
      ) : entries.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">暂无记录。</p>
      ) : (
        <div className="divide-y divide-border px-5 pb-2">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center gap-4 py-2.5">
              <Badge status={e.failed ? 'crit' : 'online'}>{e.failed ? '失败' : '成功'}</Badge>
              <span className="w-32 truncate text-sm text-text">{e.user || '—'}</span>
              <span className="flex-1 truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                {e.ip || '—'}
              </span>
              <span className="text-xs text-muted">{e.when}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
