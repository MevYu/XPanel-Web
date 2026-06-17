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
import { Plus, Search, FolderSymlink } from 'lucide-react'
import { uid } from '../lib/uid'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

interface Account {
  user: string
  home: string
  readonly: boolean
  enabled: boolean
}

interface Settings {
  home_base: string
  config_dir: string
  virtual_uid: string
  virtual_gid: string
}

interface CreateForm {
  user: string
  password: string
  home: string
  readonly: boolean
}

const emptyCreate: CreateForm = { user: '', password: '', home: '', readonly: false }

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

// 生成一段非密码学强度的随机口令(uid 已守卫 crypto 缺失环境),仅作"自动生成可改"的便利。
function suggestPassword(): string {
  return uid().replace(/-/g, '').slice(0, 16)
}

/** FTP:aaPanel 风格的虚拟账户管理 —— 工具栏 + 紧凑表 + 固定尺寸添加/改密弹窗 + 服务设置,全部需要 admin 角色。 */
export default function Ftp() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [accounts, setAccounts] = useState<Account[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<CreateForm>(emptyCreate)
  const [pwUser, setPwUser] = useState<string | null>(null)
  const [pwValue, setPwValue] = useState('')

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [a, s] = await Promise.all([
        apiFetch<{ accounts: Account[] }>('/api/m/ftp/accounts'),
        apiFetch<{ settings: Settings }>('/api/m/ftp/settings'),
      ])
      setAccounts(a.accounts)
      setSettings(s.settings)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const newUser = form.user.trim()
  const canCreate = newUser.length > 0 && form.password.length > 0 && !busy && isAdmin

  function openAdd() {
    setForm({ ...emptyCreate, password: suggestPassword() })
    setFeedback(null)
    setAdding(true)
  }

  async function create() {
    if (!canCreate) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/ftp/accounts', {
        method: 'POST',
        body: JSON.stringify({
          user: newUser,
          password: form.password,
          home: form.home.trim(),
          readonly: form.readonly,
        }),
      })
      setAdding(false)
      setForm(emptyCreate)
      setFeedback({ kind: 'ok', text: `账户 ${newUser} 已创建` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function changePassword() {
    if (!pwUser || pwValue.length === 0 || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/ftp/accounts/${encodeURIComponent(pwUser)}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: pwValue }),
      })
      setFeedback({ kind: 'ok', text: `账户 ${pwUser} 密码已更新` })
      setPwUser(null)
      setPwValue('')
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function toggle(acc: Account, next: boolean) {
    if (!isAdmin) return
    setFeedback(null)
    try {
      await apiFetch(
        `/api/m/ftp/accounts/${encodeURIComponent(acc.user)}/${next ? 'enable' : 'disable'}`,
        { method: 'POST' },
      )
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function remove(acc: Account) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除账户 ${acc.user}?此操作危险且不可恢复。`)) return
    setFeedback(null)
    try {
      await apiFetch(`/api/m/ftp/accounts/${encodeURIComponent(acc.user)}`, {
        method: 'DELETE',
        headers: DANGER,
      })
      if (pwUser === acc.user) setPwUser(null)
      setFeedback({ kind: 'ok', text: `账户 ${acc.user} 已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function saveSettings() {
    if (!settings || busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<{ settings: Settings }>('/api/m/ftp/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setSettings(res.settings)
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function setS<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s))
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter(
      (a) => a.user.toLowerCase().includes(q) || a.home.toLowerCase().includes(q),
    )
  }, [accounts, query])

  const columns: Column<Account>[] = useMemo(
    () => [
      {
        key: 'user',
        header: '用户名',
        cell: (a) => (
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <FolderSymlink size={15} className="shrink-0 text-warn" />
            <span className="truncate">{a.user}</span>
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '120px',
        cell: (a) => (
          <span className="inline-flex items-center gap-2">
            <Switch
              checked={a.enabled}
              onChange={(next) => void toggle(a, next)}
              disabled={!isAdmin}
              aria-label={`${a.enabled ? '停用' : '启用'} 账户 ${a.user}`}
            />
            <span className="text-xs text-muted">{a.enabled ? '已启用' : '已停用'}</span>
          </span>
        ),
      },
      {
        key: 'home',
        header: '根目录',
        cell: (a) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {a.home || '—'}
          </span>
        ),
      },
      {
        key: 'access',
        header: '权限',
        width: '88px',
        cell: (a) => (
          <Badge status={a.readonly ? 'neutral' : 'online'}>{a.readonly ? '只读' : '读写'}</Badge>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '120px',
        align: 'right',
        cell: (a) => (
          <ActionLinks>
            <ActionLink
              disabled={!isAdmin}
              title={isAdmin ? '修改密码' : '需要 admin 角色'}
              onClick={() => {
                setPwUser(a.user)
                setPwValue('')
                setFeedback(null)
              }}
            >
              改密
            </ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin}
              aria-label="删除账户"
              title={isAdmin ? '删除账户' : '需要 admin 角色'}
              onClick={() => void remove(a)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin],
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
            FTP
          </h1>
          <p className="text-xs text-muted">
            {accounts.length > 0
              ? `共 ${accounts.length} 个账户`
              : '管理 pure-ftpd 虚拟账户,支持只读 / 读写与启停'}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="md" disabled={!isAdmin} onClick={openAdd}>
            <Plus size={15} />
            添加 FTP 账户
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
            placeholder="搜索用户名或根目录"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
      </div>

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

      {loadErr && accounts.length === 0 && !loading && (
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
        <Table
          columns={columns}
          rows={visible}
          rowKey={(a) => a.user}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">
                {accounts.length === 0 ? '还没有 FTP 账户' : '没有匹配的账户'}
              </span>
              <span className="text-xs text-muted">
                {accounts.length === 0
                  ? '点击「添加 FTP 账户」创建第一个虚拟用户。'
                  : '换个关键词试试。'}
              </span>
            </span>
          }
        />
      )}

      {!isAdmin && <p className="text-xs text-muted">FTP 账户与设置操作需要 admin 角色。</p>}

      {settings && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">服务设置</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="家目录基路径 (home_base)"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={settings.home_base}
              onChange={(e) => setS('home_base', e.target.value)}
            />
            <Input
              label="配置目录 (config_dir)"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={settings.config_dir}
              onChange={(e) => setS('config_dir', e.target.value)}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">虚拟用户 uid (virtual_uid)</span>
              <input
                className={fieldClass}
                spellCheck={false}
                value={settings.virtual_uid}
                onChange={(e) => setS('virtual_uid', e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">虚拟用户 gid (virtual_gid)</span>
              <input
                className={fieldClass}
                spellCheck={false}
                value={settings.virtual_gid}
                onChange={(e) => setS('virtual_gid', e.target.value)}
              />
            </label>
          </div>
          <div>
            <Button onClick={() => void saveSettings()} disabled={busy || !isAdmin}>
              保存设置
            </Button>
          </div>
        </Card>
      )}

      {adding && (
        <Modal title="添加 FTP 账户" size="sm" onClose={() => setAdding(false)}>
          <div className="flex flex-col gap-4">
            <Input
              label="用户名"
              placeholder="例如 webftp"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoFocus
              value={form.user}
              onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
            />
            <div className="flex items-end gap-2">
              <Input
                label="密码"
                type="text"
                placeholder="账户登录密码"
                autoComplete="new-password"
                spellCheck={false}
                className="flex-1 font-[family-name:var(--font-mono)]"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
              <Button
                variant="ghost"
                onClick={() => setForm((f) => ({ ...f, password: suggestPassword() }))}
              >
                随机生成
              </Button>
            </div>
            <Input
              label="根目录"
              placeholder="留空使用默认 home_base/<用户名>"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={form.home}
              onChange={(e) => setForm((f) => ({ ...f, home: e.target.value }))}
            />
            <label className="flex items-center gap-3">
              <Switch
                checked={form.readonly}
                onChange={(next) => setForm((f) => ({ ...f, readonly: next }))}
                aria-label="只读账户"
              />
              <span className="text-sm text-muted">只读账户(不允许写入)</span>
            </label>
            {feedback?.kind === 'err' && (
              <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
                {feedback.text}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
                取消
              </Button>
              <Button onClick={() => void create()} disabled={!canCreate}>
                {busy && <Spinner size={14} />}
                创建账户
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pwUser && (
        <Modal title={`修改密码 · ${pwUser}`} size="sm" onClose={() => setPwUser(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-2">
              <Input
                label="新密码"
                type="text"
                autoComplete="new-password"
                spellCheck={false}
                autoFocus
                className="flex-1 font-[family-name:var(--font-mono)]"
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
              />
              <Button variant="ghost" onClick={() => setPwValue(suggestPassword())}>
                随机生成
              </Button>
            </div>
            {feedback?.kind === 'err' && (
              <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
                {feedback.text}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setPwUser(null)} disabled={busy}>
                取消
              </Button>
              <Button onClick={() => void changePassword()} disabled={pwValue.length === 0 || busy}>
                {busy && <Spinner size={14} />}
                保存密码
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
