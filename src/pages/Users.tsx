import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { IconButton } from '../components/IconButton'
import { SettingsModal } from '../components/SettingsModal'
import {
  Plus,
  Search,
  ShieldCheck,
  KeyRound,
  User,
  Users as UsersIcon,
  ChevronLeft,
  ChevronRight,
  Settings2,
} from 'lucide-react'
import { formatTime } from '../lib/formatTime'

const PAGE_SIZES = [10, 20, 50] as const

const DANGER = { 'X-Confirm-Danger': '1' }

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function fmtTime(unix: number | null): string {
  return formatTime(unix ?? 0)
}

type Role = 'admin' | 'operator' | 'readonly'
const ROLES: Role[] = ['admin', 'operator', 'readonly']
const ROLE_LABEL: Record<Role, string> = { admin: '管理员', operator: '操作员', readonly: '只读' }
const ROLE_BADGE: Record<Role, 'online' | 'warn' | 'neutral'> = {
  admin: 'warn',
  operator: 'online',
  readonly: 'neutral',
}

interface UserInfo {
  id: number
  username: string
  role: string
  created_at: number
  totp_enabled: boolean
  last_login_at: number | null
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

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/

/** Users 用户与凭证:面板用户紧凑表(增删改角色/重置密码,admin),自身 2FA 绑定与 API Key。 */
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

interface UsersSettings {
  totp_issuer: string
}

function UserTable() {
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [creating, setCreating] = useState(false)
  const [rolingUser, setRolingUser] = useState<UserInfo | null>(null)
  const [pwdUser, setPwdUser] = useState<UserInfo | null>(null)

  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

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

  async function remove(u: UserInfo) {
    if (!window.confirm(`确认删除用户「${u.username}」?此操作危险且不可恢复。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/users/users/${u.id}`, { method: 'DELETE', headers: DANGER })
      setFeedback({ kind: 'ok', text: `用户 ${u.username} 已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.username.toLowerCase().includes(q) || (ROLE_LABEL[u.role as Role] ?? u.role).includes(q),
    )
  }, [users, query])

  // 搜索或每页条数变化、行数缩减时把当前页夹回有效范围,避免停在空页。
  const total = visible.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  const pageRows = useMemo(
    () => visible.slice(page * pageSize, page * pageSize + pageSize),
    [visible, page, pageSize],
  )

  const columns: Column<UserInfo>[] = useMemo(
    () => [
      {
        key: 'username',
        header: '用户名',
        cell: (u) => (
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <User size={15} className="shrink-0 text-gold" />
            <span className="truncate">{u.username}</span>
          </span>
        ),
      },
      {
        key: 'role',
        header: '角色',
        width: '110px',
        cell: (u) => {
          const r = u.role as Role
          return <Badge status={ROLE_BADGE[r] ?? 'neutral'}>{ROLE_LABEL[r] ?? u.role}</Badge>
        },
      },
      {
        key: 'totp',
        header: '2FA',
        width: '92px',
        cell: (u) =>
          u.totp_enabled ? (
            <Badge status="online">已开启</Badge>
          ) : (
            <Badge status="neutral">未开启</Badge>
          ),
      },
      {
        key: 'last_login',
        header: '最近登录',
        width: '180px',
        cell: (u) => (
          <span className="text-xs text-muted">
            {u.last_login_at ? fmtTime(u.last_login_at) : '从未登录'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '170px',
        align: 'right',
        cell: (u) => (
          <ActionLinks>
            <ActionLink onClick={() => setPwdUser(u)}>改密</ActionLink>
            <ActionLink onClick={() => setRolingUser(u)}>角色</ActionLink>
            <ActionLink danger aria-label="删除用户" onClick={() => void remove(u)}>
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [],
  )

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="md" onClick={() => setCreating(true)} disabled={busy}>
            <Plus size={15} />
            添加用户
          </Button>
          <Button variant="ghost" size="md" onClick={() => void load()} disabled={busy}>
            刷新
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
            placeholder="搜索用户名或角色"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
      </div>

      {feedback && (
        <p
          className={`flex items-center justify-between gap-3 rounded-(--radius-card) border px-3 py-2 text-sm ${
            feedback.kind === 'ok'
              ? 'border-online/40 bg-online-soft text-online'
              : 'border-crit/40 bg-crit/10 text-crit'
          }`}
        >
          {feedback.text}
          <button
            onClick={() => setFeedback(null)}
            className="text-xs text-muted hover:text-text"
            aria-label="关闭提示"
          >
            知道了
          </button>
        </p>
      )}

      {loadErr && users.length === 0 && !loading && (
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
            rows={pageRows}
            rowKey={(u) => u.id}
            emptyText={
              <EmptyState
                icon={<UsersIcon />}
                title={users.length === 0 ? '还没有面板用户' : '没有匹配的用户'}
                hint={users.length === 0 ? '点击「添加用户」创建第一个账号。' : '换个关键词试试。'}
              />
            }
          />
          {total > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
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
        </>
      )}

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false)
            setFeedback({ kind: 'ok', text: `用户 ${name} 已创建` })
            void load()
          }}
        />
      )}
      {rolingUser && (
        <RoleModal
          user={rolingUser}
          onClose={() => setRolingUser(null)}
          onSaved={(name, next) => {
            setRolingUser(null)
            setFeedback({ kind: 'ok', text: `${name} 角色已改为 ${ROLE_LABEL[next]}` })
            void load()
          }}
        />
      )}
      {pwdUser && (
        <PasswordModal
          user={pwdUser}
          onClose={() => setPwdUser(null)}
          onSaved={(name) => {
            setPwdUser(null)
            setFeedback({ kind: 'ok', text: `${name} 密码已重置` })
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal<UsersSettings>
          title="用户设置"
          endpoint="/api/m/users/settings"
          isAdmin
          onClose={() => setSettingsOpen(false)}
        >
          {(form, set, disabled) => (
            <Input
              label="2FA 颁发者 totp_issuer"
              placeholder="XPanel"
              value={form.totp_issuer}
              disabled={disabled}
              spellCheck={false}
              error={
                form.totp_issuer.length > 64 ? '颁发者需 1-64 字符' : undefined
              }
              onChange={(e) => set('totp_issuer', e.target.value)}
            />
          )}
        </SettingsModal>
      )}
    </>
  )
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (username: string) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('operator')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const name = username.trim()
  const usernameValid = USERNAME_RE.test(name)
  const passwordValid = password.length >= 8
  const canSubmit = usernameValid && passwordValid && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/users/users', {
        method: 'POST',
        body: JSON.stringify({ username: name, password, role }),
      })
      onCreated(name)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="添加用户" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="用户名"
          placeholder="3–32 位,字母数字 _ - ."
          value={username}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          error={username.length > 0 && !usernameValid ? '3–32 位,字母数字 _ - .' : undefined}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          label="密码"
          type="password"
          placeholder="至少 8 位"
          value={password}
          error={password.length > 0 && !passwordValid ? '至少 8 位' : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">角色</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-10 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>

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
            创建用户
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function RoleModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserInfo
  onClose: () => void
  onSaved: (username: string, role: Role) => void
}) {
  const [role, setRole] = useState<Role>((user.role as Role) ?? 'operator')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (role === user.role) {
      onClose()
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/api/m/users/users/${user.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      })
      onSaved(user.username, role)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`修改角色 · ${user.username}`} size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">角色</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            aria-label="角色"
            className="h-10 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Spinner size={14} />}
            保存
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PasswordModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserInfo
  onClose: () => void
  onSaved: (username: string) => void
}) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const valid = password.length >= 8

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/api/m/users/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      onSaved(user.username)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`重置密码 · ${user.username}`} size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="新密码"
          type="password"
          placeholder="至少 8 位"
          value={password}
          autoFocus
          error={password.length > 0 && !valid ? '至少 8 位' : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!valid || busy}>
            {busy && <Spinner size={14} />}
            重置密码
          </Button>
        </div>
      </div>
    </Modal>
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
      <h2 className="flex items-center gap-2 text-sm font-medium text-text">
        <ShieldCheck size={15} className="text-warn" />
        两步验证 (TOTP)
      </h2>
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
            <Button size="sm" onClick={() => void verify()} disabled={code.trim().length !== 6 || busy}>
              验证并开启
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSetup(null)} disabled={busy}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void begin()} disabled={busy}>
            绑定两步验证
          </Button>
          <Button size="sm" variant="danger" onClick={() => void disable()} disabled={busy}>
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
      await apiFetch(`/api/m/users/api-keys/${k.id}`, { method: 'DELETE', headers: DANGER })
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
      <h2 className="flex items-center gap-2 text-sm font-medium text-text">
        <KeyRound size={15} className="text-warn" />
        API Key
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="名称"
          placeholder="例如 CI 发布"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button size="sm" onClick={() => void create()} disabled={!nameValid || busy}>
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
