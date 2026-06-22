import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Input } from '../components/Input'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Tabs } from '../components/Tabs'
import { EmptyState } from '../components/EmptyState'
import { InstallGate } from '../components/InstallGate'
import { Plus, Search, Globe, Mailbox as MailboxIcon, Forward, Settings2 } from 'lucide-react'

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

type Section = 'domains' | 'mailboxes' | 'aliases' | 'settings'

const SECTIONS: { key: Section; label: string; Icon: typeof Globe }[] = [
  { key: 'domains', label: '邮件域名', Icon: Globe },
  { key: 'mailboxes', label: '邮箱账户', Icon: MailboxIcon },
  { key: 'aliases', label: '别名/转发', Icon: Forward },
  { key: 'settings', label: '服务设置', Icon: Settings2 },
]

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

  const [section, setSection] = useState<Section>('domains')
  const [query, setQuery] = useState('')
  const [domainModal, setDomainModal] = useState(false)
  const [boxModal, setBoxModal] = useState(false)
  const [aliasModal, setAliasModal] = useState(false)
  const [pwBox, setPwBox] = useState<Mailbox | null>(null)

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

  const run = useCallback(
    async (fn: () => Promise<void>, ok: string) => {
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
    },
    [busy, isAdmin, load],
  )

  const deleteDomain = (d: Domain) => {
    if (!window.confirm(`确认删除邮件域 ${d.domain}?此操作危险且不可恢复。`)) return
    void run(async () => {
      await apiFetch(`/api/m/mail/domains/${encodeURIComponent(d.domain)}`, {
        method: 'DELETE',
        headers: DANGER,
      })
    }, `邮件域 ${d.domain} 已删除`)
  }

  const deleteMailbox = (b: Mailbox) => {
    if (!window.confirm(`确认删除邮箱 ${b.address}?此操作危险且不可恢复。`)) return
    void run(async () => {
      await apiFetch(`/api/m/mail/mailboxes/${encodeURIComponent(b.address)}`, {
        method: 'DELETE',
        headers: DANGER,
      })
    }, `邮箱 ${b.address} 已删除`)
  }

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

  const domainColumns: Column<Domain>[] = [
    {
      key: 'domain',
      header: '域名',
      cell: (d) => (
        <span className="inline-flex items-center gap-2 font-medium text-text">
          <Globe size={15} className="shrink-0 text-brand/70" />
          <span className="truncate">{d.domain}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: '状态',
      width: '96px',
      cell: (d) => (
        <Badge status={d.enabled ? 'online' : 'neutral'}>{d.enabled ? '启用' : '停用'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '88px',
      align: 'right',
      cell: (d) => (
        <ActionLinks>
          <ActionLink
            danger
            disabled={!isAdmin || busy}
            aria-label="删除邮件域"
            onClick={() => deleteDomain(d)}
          >
            删除
          </ActionLink>
        </ActionLinks>
      ),
    },
  ]

  const mailboxColumns: Column<Mailbox>[] = [
    {
      key: 'address',
      header: '邮箱地址',
      cell: (b) => (
        <span className="inline-flex items-center gap-2 font-medium text-text">
          <MailboxIcon size={15} className="shrink-0 text-brand/70" />
          <span className="truncate font-[family-name:var(--font-mono)] text-xs">{b.address}</span>
        </span>
      ),
    },
    {
      key: 'quota',
      header: '配额',
      width: '110px',
      cell: (b) => <Badge status="neutral">{b.quota_mb > 0 ? `${b.quota_mb} MB` : '不限'}</Badge>,
    },
    {
      key: 'actions',
      header: '操作',
      width: '140px',
      align: 'right',
      cell: (b) => (
        <ActionLinks>
          <ActionLink disabled={busy} onClick={() => setPwBox(b)}>
            改密
          </ActionLink>
          <ActionLink
            danger
            disabled={!isAdmin || busy}
            aria-label="删除邮箱"
            onClick={() => deleteMailbox(b)}
          >
            删除
          </ActionLink>
        </ActionLinks>
      ),
    },
  ]

  const aliasColumns: Column<Alias>[] = [
    {
      key: 'source',
      header: '源地址',
      cell: (a) => (
        <span className="inline-flex items-center gap-2 font-medium text-text">
          <Forward size={15} className="shrink-0 text-brand/70" />
          <span className="truncate font-[family-name:var(--font-mono)] text-xs">{a.source}</span>
        </span>
      ),
    },
    {
      key: 'destination',
      header: '目标地址',
      cell: (a) => (
        <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
          {a.destination}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '88px',
      align: 'right',
      cell: (a) => (
        <ActionLinks>
          <ActionLink
            danger
            disabled={!isAdmin || busy}
            aria-label="删除别名"
            onClick={() => deleteAlias(a)}
          >
            删除
          </ActionLink>
        </ActionLinks>
      ),
    },
  ]

  const q = query.trim().toLowerCase()
  const visibleDomains = useMemo(
    () => (q ? domains.filter((d) => d.domain.toLowerCase().includes(q)) : domains),
    [domains, q],
  )
  const visibleMailboxes = useMemo(
    () => (q ? mailboxes.filter((b) => b.address.toLowerCase().includes(q)) : mailboxes),
    [mailboxes, q],
  )
  const visibleAliases = useMemo(
    () =>
      q
        ? aliases.filter(
            (a) => a.source.toLowerCase().includes(q) || a.destination.toLowerCase().includes(q),
          )
        : aliases,
    [aliases, q],
  )

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
    <InstallGate moduleId="mail">
    <div className="flex flex-col gap-4">
      <Tabs
        tabs={SECTIONS.map((s) => ({
          key: s.key,
          label: (
            <span className="flex items-center gap-2">
              <s.Icon size={15} />
              {s.label}
            </span>
          ),
        }))}
        active={section}
        onChange={(s) => {
          setSection(s)
          setQuery('')
        }}
      />

      {loadErr && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`} role="status">
          {feedback.text}
        </p>
      )}

      {section === 'domains' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button size="md" disabled={busy} onClick={() => setDomainModal(true)}>
              <Plus size={15} />
              添加域名
            </Button>
            <SearchBox value={query} placeholder="搜索域名" onChange={setQuery} />
          </div>
          <Table
            columns={domainColumns}
            rows={visibleDomains}
            rowKey={(d) => d.domain}
            emptyText={
              <EmptyState
                icon={<Globe />}
                title={domains.length === 0 ? '还没有邮件域' : '没有匹配的邮件域'}
                hint={
                  domains.length === 0
                    ? '点击「添加域名」录入第一个域,之后才能创建邮箱与别名。'
                    : '换个关键词试试。'
                }
              />
            }
          />
        </div>
      )}

      {section === 'mailboxes' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              size="md"
              disabled={busy || domains.length === 0}
              title={domains.length === 0 ? '请先添加邮件域' : undefined}
              onClick={() => setBoxModal(true)}
            >
              <Plus size={15} />
              添加邮箱
            </Button>
            <SearchBox value={query} placeholder="搜索邮箱地址" onChange={setQuery} />
          </div>
          <Table
            columns={mailboxColumns}
            rows={visibleMailboxes}
            rowKey={(b) => b.address}
            emptyText={
              <EmptyState
                icon={<MailboxIcon />}
                title={mailboxes.length === 0 ? '还没有邮箱账户' : '没有匹配的邮箱'}
                hint={
                  mailboxes.length === 0
                    ? domains.length === 0
                      ? '请先到「邮件域名」添加一个域,再回来创建邮箱。'
                      : '点击「添加邮箱」创建带口令与配额的邮箱账户。'
                    : '换个关键词试试。'
                }
              />
            }
          />
        </div>
      )}

      {section === 'aliases' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              size="md"
              disabled={busy || domains.length === 0}
              title={domains.length === 0 ? '请先添加邮件域' : undefined}
              onClick={() => setAliasModal(true)}
            >
              <Plus size={15} />
              添加别名
            </Button>
            <SearchBox value={query} placeholder="搜索源或目标地址" onChange={setQuery} />
          </div>
          <Table
            columns={aliasColumns}
            rows={visibleAliases}
            rowKey={(a) => `${a.source}->${a.destination}`}
            emptyText={
              <EmptyState
                icon={<Forward />}
                title={aliases.length === 0 ? '还没有别名' : '没有匹配的别名'}
                hint={
                  aliases.length === 0
                    ? domains.length === 0
                      ? '请先到「邮件域名」添加一个域,再回来配置转发。'
                      : '点击「添加别名」把来信转发到另一个邮箱。'
                    : '换个关键词试试。'
                }
              />
            }
          />
        </div>
      )}

      {section === 'settings' && settings && (
        <SettingsForm
          settings={settings}
          busy={busy}
          onSave={(next) =>
            run(async () => {
              const res = await apiFetch<{ settings: Settings }>('/api/m/mail/settings', {
                method: 'PUT',
                body: JSON.stringify(next),
              })
              setSettings(res.settings)
            }, '设置已保存')
          }
        />
      )}

      {domainModal && (
        <AddDomainModal
          busy={busy}
          onClose={() => setDomainModal(false)}
          onSubmit={(domain) =>
            run(async () => {
              await apiFetch('/api/m/mail/domains', {
                method: 'POST',
                body: JSON.stringify({ domain }),
              })
              setDomainModal(false)
            }, '邮件域已添加')
          }
        />
      )}
      {boxModal && (
        <AddMailboxModal
          busy={busy}
          onClose={() => setBoxModal(false)}
          onSubmit={(payload) =>
            run(async () => {
              await apiFetch('/api/m/mail/mailboxes', {
                method: 'POST',
                body: JSON.stringify(payload),
              })
              setBoxModal(false)
            }, '邮箱已创建')
          }
        />
      )}
      {aliasModal && (
        <AddAliasModal
          busy={busy}
          onClose={() => setAliasModal(false)}
          onSubmit={(payload) =>
            run(async () => {
              await apiFetch('/api/m/mail/aliases', {
                method: 'POST',
                body: JSON.stringify(payload),
              })
              setAliasModal(false)
            }, '别名已添加')
          }
        />
      )}
      {pwBox && (
        <ChangePasswordModal
          box={pwBox}
          busy={busy}
          onClose={() => setPwBox(null)}
          onSubmit={(password) =>
            run(async () => {
              await apiFetch(`/api/m/mail/mailboxes/${encodeURIComponent(pwBox.address)}/password`, {
                method: 'POST',
                body: JSON.stringify({ password }),
              })
              setPwBox(null)
            }, '邮箱密码已更新')
          }
        />
      )}
    </div>
    </InstallGate>
  )
}

function SearchBox({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative w-56">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      />
    </div>
  )
}

function ModalFooter({
  onClose,
  busy,
  disabled,
  submitLabel,
  onSubmit,
}: {
  onClose: () => void
  busy: boolean
  disabled: boolean
  submitLabel: string
  onSubmit: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        取消
      </Button>
      <Button onClick={onSubmit} disabled={disabled}>
        {busy && <Spinner size={14} />}
        {submitLabel}
      </Button>
    </div>
  )
}

function AddDomainModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean
  onClose: () => void
  onSubmit: (domain: string) => void
}) {
  const [domain, setDomain] = useState('')
  const value = domain.trim()
  return (
    <Modal title="添加邮件域" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="域名"
          placeholder="例如 example.com"
          value={domain}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          onChange={(e) => setDomain(e.target.value)}
        />
        <ModalFooter
          onClose={onClose}
          busy={busy}
          disabled={busy || value.length === 0}
          submitLabel="添加域名"
          onSubmit={() => onSubmit(value)}
        />
      </div>
    </Modal>
  )
}

function AddMailboxModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean
  onClose: () => void
  onSubmit: (payload: { address: string; password: string; quota_mb: number }) => void
}) {
  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const [quota, setQuota] = useState('0')
  const canSubmit = !busy && address.trim().length > 0 && password.length > 0
  return (
    <Modal title="添加邮箱" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="邮箱地址"
          placeholder="user@example.com"
          value={address}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          onChange={(e) => setAddress(e.target.value)}
        />
        <Input
          label="密码"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="配额 (MB,0 为不限)"
          type="number"
          min={0}
          value={quota}
          onChange={(e) => setQuota(e.target.value)}
        />
        <ModalFooter
          onClose={onClose}
          busy={busy}
          disabled={!canSubmit}
          submitLabel="创建邮箱"
          onSubmit={() =>
            onSubmit({ address: address.trim(), password, quota_mb: Number(quota) || 0 })
          }
        />
      </div>
    </Modal>
  )
}

function AddAliasModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean
  onClose: () => void
  onSubmit: (payload: { source: string; destination: string }) => void
}) {
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const canSubmit = !busy && source.trim().length > 0 && destination.trim().length > 0
  return (
    <Modal title="添加别名" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="源地址"
          placeholder="alias@example.com"
          value={source}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          onChange={(e) => setSource(e.target.value)}
        />
        <Input
          label="目标地址"
          placeholder="dest@example.com"
          value={destination}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => setDestination(e.target.value)}
        />
        <ModalFooter
          onClose={onClose}
          busy={busy}
          disabled={!canSubmit}
          submitLabel="添加别名"
          onSubmit={() => onSubmit({ source: source.trim(), destination: destination.trim() })}
        />
      </div>
    </Modal>
  )
}

function ChangePasswordModal({
  box,
  busy,
  onClose,
  onSubmit,
}: {
  box: Mailbox
  busy: boolean
  onClose: () => void
  onSubmit: (password: string) => void
}) {
  const [password, setPassword] = useState('')
  return (
    <Modal title={`修改密码 · ${box.address}`} size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="新密码"
          type="password"
          autoComplete="new-password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        <ModalFooter
          onClose={onClose}
          busy={busy}
          disabled={busy || password.length === 0}
          submitLabel="保存密码"
          onSubmit={() => onSubmit(password)}
        />
      </div>
    </Modal>
  )
}

const SETTINGS_FIELDS: { key: keyof Settings; label: string }[] = [
  { key: 'postfix_config_dir', label: 'postfix 配置目录' },
  { key: 'dovecot_config_dir', label: 'dovecot 配置目录' },
  { key: 'mail_store_dir', label: '邮件存储目录' },
  { key: 'virtual_mailbox_file', label: '虚拟邮箱 map 文件' },
  { key: 'virtual_domain_file', label: '虚拟域 map 文件' },
  { key: 'virtual_alias_file', label: '虚拟别名 map 文件' },
]

function SettingsForm({
  settings,
  busy,
  onSave,
}: {
  settings: Settings
  busy: boolean
  onSave: (next: Settings) => void
}) {
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [settings])
  return (
    <div className="flex flex-col gap-4 rounded-(--radius-card) border border-border bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {SETTINGS_FIELDS.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            className="font-[family-name:var(--font-mono)]"
            spellCheck={false}
            value={draft[f.key]}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
          />
        ))}
      </div>
      <div>
        <Button onClick={() => onSave(draft)} disabled={busy}>
          {busy && <Spinner size={14} />}
          保存设置
        </Button>
      </div>
    </div>
  )
}
