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

/** FTP:管理 pure-ftpd 虚拟账户(列表、创建、改密、启停、删除)与服务设置,全部需要 admin 角色。 */
export default function Ftp() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [accounts, setAccounts] = useState<Account[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

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

  const user = form.user.trim()
  const canCreate = user.length > 0 && form.password.length > 0 && !busy && isAdmin

  async function create() {
    if (!canCreate) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/ftp/accounts', {
        method: 'POST',
        body: JSON.stringify({
          user,
          password: form.password,
          home: form.home.trim(),
          readonly: form.readonly,
        }),
      })
      setFeedback({ kind: 'ok', text: `账户 ${user} 已创建` })
      setForm(emptyCreate)
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

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">创建账户</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="用户名"
            placeholder="例如 webftp"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={form.user}
            onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
          />
          <Input
            label="密码"
            type="password"
            placeholder="账户登录密码"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </div>
        <Input
          label="家目录"
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
            disabled={!isAdmin}
            aria-label="只读账户"
          />
          <span className="text-sm text-muted">只读账户(不允许写入)</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void create()} disabled={!canCreate}>
            创建
          </Button>
          {busy && <Spinner size={16} />}
        </div>
        {!isAdmin && <p className="text-xs text-muted">FTP 账户与设置操作需要 admin 角色。</p>}
        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">账户列表</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && accounts.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">{loadErr}</p>
        ) : accounts.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">暂无 FTP 账户。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {accounts.map((acc) => (
              <div key={acc.user} className="flex flex-col gap-2 px-5 py-3.5">
                <div className="flex items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{acc.user}</span>
                      <Badge status={acc.readonly ? 'neutral' : 'online'}>
                        {acc.readonly ? '只读' : '读写'}
                      </Badge>
                    </div>
                    <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                      {acc.home}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Switch
                      checked={acc.enabled}
                      onChange={(next) => void toggle(acc, next)}
                      disabled={!isAdmin}
                      aria-label={`${acc.enabled ? '停用' : '启用'} 账户 ${acc.user}`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPwUser(pwUser === acc.user ? null : acc.user)
                        setPwValue('')
                      }}
                      disabled={!isAdmin}
                    >
                      改密
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void remove(acc)}
                      disabled={!isAdmin}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                {pwUser === acc.user && (
                  <div className="flex flex-wrap items-end gap-2 rounded-(--radius-card) bg-surface-2 p-3">
                    <Input
                      label="新密码"
                      type="password"
                      autoComplete="new-password"
                      className="flex-1"
                      value={pwValue}
                      onChange={(e) => setPwValue(e.target.value)}
                    />
                    <Button
                      onClick={() => void changePassword()}
                      disabled={pwValue.length === 0 || busy}
                    >
                      保存密码
                    </Button>
                    <Button variant="ghost" onClick={() => setPwUser(null)} disabled={busy}>
                      取消
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

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
    </div>
  )
}
