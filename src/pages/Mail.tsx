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

interface Domain {
  domain: string
  enabled: boolean
}

interface Mailbox {
  address: string
  domain: string
  maildir: string
  quota_mb: number
}

interface Alias {
  source: string
  destination: string
}

interface Settings {
  postfix_config_dir: string
  dovecot_config_dir: string
  mail_store_dir: string
  virtual_mailbox_file: string
  virtual_domain_file: string
  virtual_alias_file: string
}

/** 邮局:管理邮件域、邮箱(地址+口令+配额)、别名/转发与服务设置,全部需要 admin 角色。 */
export default function Mail() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [domains, setDomains] = useState<Domain[]>([])
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [aliases, setAliases] = useState<Alias[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [newDomain, setNewDomain] = useState('')
  const [box, setBox] = useState({ address: '', password: '', quota_mb: '0' })
  const [alias, setAlias] = useState({ source: '', destination: '' })
  const [pwAddr, setPwAddr] = useState<string | null>(null)
  const [pwValue, setPwValue] = useState('')

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [d, m, a, s] = await Promise.all([
        apiFetch<{ domains: Domain[] }>('/api/m/mail/domains'),
        apiFetch<{ mailboxes: Mailbox[] }>('/api/m/mail/mailboxes'),
        apiFetch<{ aliases: Alias[] }>('/api/m/mail/aliases'),
        apiFetch<{ settings: Settings }>('/api/m/mail/settings'),
      ])
      setDomains(d.domains)
      setMailboxes(m.mailboxes)
      setAliases(a.aliases)
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

  async function run(fn: () => Promise<void>, ok: string) {
    if (busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await fn()
      setFeedback({ kind: 'ok', text: ok })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const addDomain = () =>
    run(async () => {
      await apiFetch('/api/m/mail/domains', {
        method: 'POST',
        body: JSON.stringify({ domain: newDomain.trim() }),
      })
      setNewDomain('')
    }, '邮件域已添加')

  const deleteDomain = (d: Domain) => {
    if (!window.confirm(`确认删除邮件域 ${d.domain}?此操作危险且不可恢复。`)) return
    void run(async () => {
      await apiFetch(`/api/m/mail/domains/${encodeURIComponent(d.domain)}`, {
        method: 'DELETE',
        headers: DANGER,
      })
    }, `邮件域 ${d.domain} 已删除`)
  }

  const createMailbox = () =>
    run(async () => {
      await apiFetch('/api/m/mail/mailboxes', {
        method: 'POST',
        body: JSON.stringify({
          address: box.address.trim(),
          password: box.password,
          quota_mb: Number(box.quota_mb) || 0,
        }),
      })
      setBox({ address: '', password: '', quota_mb: '0' })
    }, '邮箱已创建')

  const deleteMailbox = (b: Mailbox) => {
    if (!window.confirm(`确认删除邮箱 ${b.address}?此操作危险且不可恢复。`)) return
    void run(async () => {
      await apiFetch(`/api/m/mail/mailboxes/${encodeURIComponent(b.address)}`, {
        method: 'DELETE',
        headers: DANGER,
      })
      if (pwAddr === b.address) setPwAddr(null)
    }, `邮箱 ${b.address} 已删除`)
  }

  const changePassword = () => {
    if (!pwAddr) return
    void run(async () => {
      await apiFetch(`/api/m/mail/mailboxes/${encodeURIComponent(pwAddr)}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: pwValue }),
      })
      setPwAddr(null)
      setPwValue('')
    }, '邮箱密码已更新')
  }

  const addAlias = () =>
    run(async () => {
      await apiFetch('/api/m/mail/aliases', {
        method: 'POST',
        body: JSON.stringify({ source: alias.source.trim(), destination: alias.destination.trim() }),
      })
      setAlias({ source: '', destination: '' })
    }, '别名已添加')

  const deleteAlias = (a: Alias) => {
    if (!window.confirm(`确认删除别名 ${a.source} → ${a.destination}?此操作危险。`)) return
    void run(async () => {
      await apiFetch('/api/m/mail/aliases', {
        method: 'DELETE',
        headers: DANGER,
        body: JSON.stringify({ source: a.source, destination: a.destination }),
      })
    }, '别名已删除')
  }

  async function saveSettings() {
    if (!settings) return
    void run(async () => {
      const res = await apiFetch<{ settings: Settings }>('/api/m/mail/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setSettings(res.settings)
    }, '设置已保存')
  }

  function setS<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s))
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  if (!isAdmin) {
    return <p className="text-sm text-muted">邮局管理需要 admin 角色。</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {loadErr && <p className="text-sm text-crit">{loadErr}</p>}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">邮件域</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label="域名"
            placeholder="例如 example.com"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="flex-1"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
          />
          <Button onClick={() => void addDomain()} disabled={busy || newDomain.trim().length === 0}>
            添加
          </Button>
        </div>
        {domains.length === 0 ? (
          <p className="text-sm text-muted">暂无邮件域。</p>
        ) : (
          <div className="divide-y divide-border rounded-(--radius-card) border border-border">
            {domains.map((d) => (
              <div key={d.domain} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 truncate text-sm text-text">{d.domain}</span>
                <Badge status={d.enabled ? 'online' : 'neutral'}>
                  {d.enabled ? '启用' : '停用'}
                </Badge>
                <Button size="sm" variant="danger" onClick={() => deleteDomain(d)} disabled={busy}>
                  删除
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">创建邮箱</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="邮箱地址"
            placeholder="user@example.com"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={box.address}
            onChange={(e) => setBox((b) => ({ ...b, address: e.target.value }))}
          />
          <Input
            label="密码"
            type="password"
            autoComplete="new-password"
            value={box.password}
            onChange={(e) => setBox((b) => ({ ...b, password: e.target.value }))}
          />
          <Input
            label="配额 (MB,0 为不限)"
            type="number"
            min={0}
            value={box.quota_mb}
            onChange={(e) => setBox((b) => ({ ...b, quota_mb: e.target.value }))}
          />
        </div>
        <div>
          <Button
            onClick={() => void createMailbox()}
            disabled={busy || box.address.trim().length === 0 || box.password.length === 0}
          >
            创建
          </Button>
        </div>
        {mailboxes.length === 0 ? (
          <p className="text-sm text-muted">暂无邮箱。</p>
        ) : (
          <div className="divide-y divide-border rounded-(--radius-card) border border-border">
            {mailboxes.map((b) => (
              <div key={b.address} className="flex flex-col gap-2 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="flex-1 truncate text-sm text-text">{b.address}</span>
                  <Badge status="neutral">{b.quota_mb > 0 ? `${b.quota_mb} MB` : '不限'}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPwAddr(pwAddr === b.address ? null : b.address)
                      setPwValue('')
                    }}
                    disabled={busy}
                  >
                    改密
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => deleteMailbox(b)}
                    disabled={busy}
                  >
                    删除
                  </Button>
                </div>
                {pwAddr === b.address && (
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
                      onClick={() => changePassword()}
                      disabled={pwValue.length === 0 || busy}
                    >
                      保存密码
                    </Button>
                    <Button variant="ghost" onClick={() => setPwAddr(null)} disabled={busy}>
                      取消
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">别名/转发</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="源地址"
            placeholder="alias@example.com"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={alias.source}
            onChange={(e) => setAlias((a) => ({ ...a, source: e.target.value }))}
          />
          <Input
            label="目标地址"
            placeholder="dest@example.com"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={alias.destination}
            onChange={(e) => setAlias((a) => ({ ...a, destination: e.target.value }))}
          />
        </div>
        <div>
          <Button
            onClick={() => void addAlias()}
            disabled={busy || alias.source.trim().length === 0 || alias.destination.trim().length === 0}
          >
            添加
          </Button>
        </div>
        {aliases.length === 0 ? (
          <p className="text-sm text-muted">暂无别名。</p>
        ) : (
          <div className="divide-y divide-border rounded-(--radius-card) border border-border">
            {aliases.map((a) => (
              <div key={`${a.source}->${a.destination}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 truncate text-sm text-text">
                  {a.source} <span className="text-muted">→</span> {a.destination}
                </span>
                <Button size="sm" variant="danger" onClick={() => deleteAlias(a)} disabled={busy}>
                  删除
                </Button>
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
              label="postfix 配置目录"
              className="font-[family-name:var(--font-mono)]"
              spellCheck={false}
              value={settings.postfix_config_dir}
              onChange={(e) => setS('postfix_config_dir', e.target.value)}
            />
            <Input
              label="dovecot 配置目录"
              className="font-[family-name:var(--font-mono)]"
              spellCheck={false}
              value={settings.dovecot_config_dir}
              onChange={(e) => setS('dovecot_config_dir', e.target.value)}
            />
            <Input
              label="邮件存储目录"
              className="font-[family-name:var(--font-mono)]"
              spellCheck={false}
              value={settings.mail_store_dir}
              onChange={(e) => setS('mail_store_dir', e.target.value)}
            />
            <Input
              label="虚拟邮箱 map 文件"
              className="font-[family-name:var(--font-mono)]"
              spellCheck={false}
              value={settings.virtual_mailbox_file}
              onChange={(e) => setS('virtual_mailbox_file', e.target.value)}
            />
            <Input
              label="虚拟域 map 文件"
              className="font-[family-name:var(--font-mono)]"
              spellCheck={false}
              value={settings.virtual_domain_file}
              onChange={(e) => setS('virtual_domain_file', e.target.value)}
            />
            <Input
              label="虚拟别名 map 文件"
              className="font-[family-name:var(--font-mono)]"
              spellCheck={false}
              value={settings.virtual_alias_file}
              onChange={(e) => setS('virtual_alias_file', e.target.value)}
            />
          </div>
          <div>
            <Button onClick={() => void saveSettings()} disabled={busy}>
              保存设置
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
