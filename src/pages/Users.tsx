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

function fmtTime(unix: number | null): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

type Role = 'admin' | 'operator' | 'readonly'
const ROLES: Role[] = ['admin', 'operator', 'readonly']

interface UserInfo {
  id: number
  username: string
  role: string
  created_at: number
  totp_enabled: boolean
}

interface ApiKeyInfo {
  id: number
  user_id: number
  name: string
  created_at: number
  last_used_at: number | null
}

interface ApiKeyCreated extends ApiKeyInfo {
  key: string
}

interface TotpSetup {
  secret: string
  otpauth_url: string
}

const newUserEmpty = { username: '', password: '', role: 'operator' as Role }

/** Users 用户与凭证:用户增删改角色与重置密码(admin),自身 2FA 绑定/关闭,API Key 创建/列出/吊销。 */
export default function Users() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  return (
    <div className="flex flex-col gap-4">
      {isAdmin ? (
        <UserTable />
      ) : (
        <Card>
          <p className="text-sm text-muted">用户管理需要 admin 角色,以下为个人凭证设置。</p>
        </Card>
      )}
      <TwoFactor />
      <ApiKeys />
    </div>
  )
}

function UserTable() {
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState(newUserEmpty)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setUsers(await apiFetch<UserInfo[]>('/api/m/users/users'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const username = form.username.trim()
  const usernameValid = /^[A-Za-z0-9_.-]{3,32}$/.test(username)
  const passwordValid = form.password.length >= 8
  const canCreate = usernameValid && passwordValid && !busy

  async function create() {
    if (!canCreate) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/users/users', {
        method: 'POST',
        body: JSON.stringify({ username, password: form.password, role: form.role }),
      })
      setFeedback({ kind: 'ok', text: `用户 ${username} 已创建` })
      setForm(newUserEmpty)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(u: UserInfo, next: Role) {
    if (next === u.role) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/users/users/${u.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: next }),
      })
      setFeedback({ kind: 'ok', text: `${u.username} 角色已改为 ${next}` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(u: UserInfo) {
    const pwd = window.prompt(`为 ${u.username} 设置新密码(至少 8 位):`)
    if (pwd === null) return
    if (pwd.length < 8) {
      setFeedback({ kind: 'err', text: '密码至少 8 位' })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/users/users/${u.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: pwd }),
      })
      setFeedback({ kind: 'ok', text: `${u.username} 密码已重置` })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(u: UserInfo) {
    if (!window.confirm(`确认删除用户「${u.username}」?此操作危险且不可恢复。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/users/users/${u.id}`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Danger': '1' },
      })
      setFeedback({ kind: 'ok', text: `用户 ${u.username} 已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">新增用户</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="用户名"
            placeholder="3–32 位,字母数字 _ - ."
            value={form.username}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            error={form.username.length > 0 && !usernameValid ? '3–32 位,字母数字 _ - .' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          />
          <Input
            label="密码"
            type="password"
            placeholder="至少 8 位"
            value={form.password}
            error={form.password.length > 0 && !passwordValid ? '至少 8 位' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">角色</span>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
              className="h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void create()} disabled={!canCreate}>
            创建用户
          </Button>
          {busy && <Spinner size={16} />}
        </div>
        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">用户列表</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && users.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">{loadErr}</p>
        ) : (
          <div className="divide-y divide-border">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-text">
                    {u.username}
                    {u.totp_enabled && <Badge status="online">2FA</Badge>}
                  </span>
                  <span className="text-xs text-muted">创建于 {fmtTime(u.created_at)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={u.role}
                    onChange={(e) => void changeRole(u, e.target.value as Role)}
                    disabled={busy}
                    aria-label={`${u.username} 角色`}
                    className="h-9 rounded-(--radius-card) border border-border bg-surface-2 px-2 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => void resetPassword(u)} disabled={busy}>
                    重置密码
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(u)} disabled={busy}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}

function TwoFactor() {
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function begin() {
    setBusy(true)
    setFeedback(null)
    try {
      setSetup(await apiFetch<TotpSetup>('/api/m/users/2fa/setup', { method: 'POST' }))
      setCode('')
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    if (code.trim().length !== 6) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/users/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      })
      setFeedback({ kind: 'ok', text: '两步验证已开启' })
      setSetup(null)
      setCode('')
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    if (!window.confirm('确认关闭两步验证?账号安全性将下降。')) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/users/2fa/disable', { method: 'POST' })
      setFeedback({ kind: 'ok', text: '两步验证已关闭' })
      setSetup(null)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">两步验证 (TOTP)</h2>
      {setup ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            用验证器 App 扫描或手动添加以下密钥,再输入 6 位动态码完成绑定。
          </p>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">otpauth URL</span>
            <code className="break-all rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text">
              {setup.otpauth_url}
            </code>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">密钥</span>
            <code className="break-all rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text">
              {setup.secret}
            </code>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="6 位验证码"
              placeholder="000000"
              inputMode="numeric"
              value={code}
              spellCheck={false}
              className="font-[family-name:var(--font-mono)]"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Button onClick={() => void verify()} disabled={code.trim().length !== 6 || busy}>
              验证并开启
            </Button>
            <Button variant="ghost" onClick={() => setSetup(null)} disabled={busy}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void begin()} disabled={busy}>
            绑定两步验证
          </Button>
          <Button variant="danger" onClick={() => void disable()} disabled={busy}>
            关闭两步验证
          </Button>
          {busy && <Spinner size={16} />}
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

function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<ApiKeyCreated | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setKeys(await apiFetch<ApiKeyInfo[]>('/api/m/users/api-keys'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const nameValid = name.trim().length > 0 && name.trim().length <= 64

  async function create() {
    if (!nameValid || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<ApiKeyCreated>('/api/m/users/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      })
      setCreated(res)
      setName('')
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function revoke(k: ApiKeyInfo) {
    if (!window.confirm(`确认吊销 API Key「${k.name}」?使用该密钥的客户端将立即失效。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/users/api-keys/${k.id}`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Danger': '1' },
      })
      if (created?.id === k.id) setCreated(null)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">API Key</h2>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="名称"
          placeholder="例如 CI 发布"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button onClick={() => void create()} disabled={!nameValid || busy}>
          创建
        </Button>
        {busy && <Spinner size={16} />}
      </div>

      {created && (
        <div className="flex flex-col gap-1.5 rounded-(--radius-card) border border-warn/40 bg-warn/10 p-3">
          <span className="text-xs font-medium text-warn">密钥仅显示一次,请立即妥善保存:</span>
          <code className="break-all font-[family-name:var(--font-mono)] text-xs text-text">
            {created.key}
          </code>
        </div>
      )}

      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : loadErr && keys.length === 0 ? (
        <p className="text-sm text-muted">{loadErr}</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted">暂无 API Key。</p>
      ) : (
        <div className="divide-y divide-border">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-medium text-text">{k.name}</span>
                <span className="text-xs text-muted">
                  创建于 {fmtTime(k.created_at)} · 最近使用 {fmtTime(k.last_used_at)}
                </span>
              </div>
              <Button size="sm" variant="danger" onClick={() => void revoke(k)} disabled={busy}>
                吊销
              </Button>
            </div>
          ))}
        </div>
      )}
      {feedback && <p className="text-sm text-crit">{feedback.text}</p>}
    </Card>
  )
}
