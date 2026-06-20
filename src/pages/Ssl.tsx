import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Switch } from '../components/Switch'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Plus, Settings2, Search, ShieldCheck, RefreshCw } from 'lucide-react'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

const selectClass =
  'h-10 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

const DAY = 86400

interface Cert {
  id: number
  domains: string
  issuer: string
  challenge: string
  cert_path: string
  key_path: string
  not_after: number
  auto_renew: boolean
  created_by: number | null
  created_at: number
  updated_at: number
  last_renew_at: number | null
}

interface SslSettings {
  cert_dir: string
  acme_dir: string
  webroot: string
  backend: string
}

type Challenge = 'webroot' | 'standalone' | 'dns'

interface IssueForm {
  domains: string
  challenge: Challenge
  webroot: string
  dns_plugin: string
}

interface UploadForm {
  domains: string
  cert: string
  key: string
}

const emptyIssue: IssueForm = { domains: '', challenge: 'webroot', webroot: '', dns_plugin: '' }
const emptyUpload: UploadForm = { domains: '', cert: '', key: '' }
const emptySettings: SslSettings = { cert_dir: '', acme_dir: '', webroot: '', backend: '' }

const challengeLabel: Record<string, string> = {
  webroot: 'webroot',
  standalone: 'standalone',
  dns: 'dns',
  upload: '上传',
}

function parseDomains(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

function expiryInfo(notAfter: number): {
  text: string
  detail: string
  status: 'online' | 'warn' | 'crit' | 'neutral'
} {
  if (!notAfter) return { text: '未知', detail: '', status: 'neutral' }
  const now = Date.now() / 1000
  const days = Math.floor((notAfter - now) / DAY)
  const date = new Date(notAfter * 1000).toLocaleDateString()
  if (days < 0) return { text: '已过期', detail: date, status: 'crit' }
  if (days <= 15) return { text: `${days} 天后到期`, detail: date, status: 'crit' }
  if (days <= 30) return { text: `${days} 天后到期`, detail: date, status: 'warn' }
  return { text: `${days} 天后`, detail: date, status: 'online' }
}

/** Ssl 证书:aaPanel 风格紧凑数据表,右上申请/上传弹窗,行内续期/删除,自动续期开关与设置弹窗。 */
export default function Ssl() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [certs, setCerts] = useState<Cert[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setCerts(await apiFetch<Cert[]>('/api/m/ssl/certs'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function renew(cert: Cert) {
    if (!canWrite) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/ssl/certs/${cert.id}/renew`, { method: 'POST' })
      setFeedback({ kind: 'ok', text: `已续期 ${cert.domains}` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function renewDue() {
    if (!canWrite) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<{ renewed: number; failed: number }>('/api/m/ssl/renew-due', {
        method: 'POST',
      })
      setFeedback({ kind: 'ok', text: `续期完成:成功 ${res.renewed},失败 ${res.failed}` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function toggleAuto(cert: Cert, next: boolean) {
    if (!canWrite) return
    try {
      await apiFetch(`/api/m/ssl/certs/${cert.id}/auto/${next ? 'on' : 'off'}`, { method: 'POST' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function remove(cert: Cert) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除证书「${cert.domains}」?此操作危险,不可恢复。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/ssl/certs/${cert.id}`, { method: 'DELETE', headers: DANGER })
      setFeedback({ kind: 'ok', text: '证书已删除' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return certs
    return certs.filter(
      (c) => c.domains.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q),
    )
  }, [certs, query])

  const columns: Column<Cert>[] = useMemo(
    () => [
      {
        key: 'domains',
        header: '域名',
        cell: (c) => (
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <ShieldCheck size={15} className="shrink-0 text-warn" />
            <span className="truncate font-[family-name:var(--font-mono)] text-xs">
              {c.domains}
            </span>
          </span>
        ),
      },
      {
        key: 'issuer',
        header: '颁发者',
        width: '120px',
        cell: (c) => <span className="text-muted">{c.issuer}</span>,
      },
      {
        key: 'challenge',
        header: '验证方式',
        width: '100px',
        cell: (c) => (
          <span className="text-muted">{challengeLabel[c.challenge] ?? c.challenge}</span>
        ),
      },
      {
        key: 'expiry',
        header: '到期时间',
        width: '170px',
        cell: (c) => {
          const exp = expiryInfo(c.not_after)
          return (
            <span className="inline-flex items-center gap-2">
              <Badge status={exp.status}>{exp.text}</Badge>
              {exp.detail && <span className="text-xs text-muted">{exp.detail}</span>}
            </span>
          )
        },
      },
      {
        key: 'auto',
        header: '自动续期',
        width: '88px',
        align: 'center',
        cell: (c) => (
          <Switch
            checked={c.auto_renew}
            onChange={(next) => void toggleAuto(c, next)}
            disabled={!canWrite}
            aria-label={`${c.auto_renew ? '关闭' : '开启'}自动续期 ${c.domains}`}
          />
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '120px',
        align: 'right',
        cell: (c) => (
          <ActionLinks>
            <ActionLink disabled={!canWrite || busy} onClick={() => void renew(c)}>
              续期
            </ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin || busy}
              aria-label="删除证书"
              title={isAdmin ? '删除证书' : '需要 admin 角色'}
              onClick={() => void remove(c)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, canWrite, busy],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="md" disabled={!canWrite} onClick={() => setFormOpen(true)}>
            <Plus size={15} />
            申请/上传证书
          </Button>
          <Button
            variant="ghost"
            size="md"
            disabled={!canWrite || busy}
            onClick={() => void renewDue()}
          >
            <RefreshCw size={15} />
            续期到期证书
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索域名或颁发者"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
      </div>

      {feedback && (
        <p
          className={`rounded-(--radius-card) border px-3 py-2 text-sm ${
            feedback.kind === 'ok'
              ? 'border-online/40 bg-online-soft text-online'
              : 'border-crit/40 bg-crit/10 text-crit'
          }`}
        >
          {feedback.text}
        </p>
      )}

      {loadErr && certs.length === 0 && !loading && (
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
          rowKey={(c) => c.id}
          emptyText={
            <span className="flex flex-col items-center gap-1.5 py-6">
              <ShieldCheck size={28} className="text-muted/60" />
              <span className="text-sm font-medium text-text">
                {certs.length === 0 ? '还没有证书' : '没有匹配的证书'}
              </span>
              <span className="text-xs text-muted">
                {certs.length === 0
                  ? '点击「申请/上传证书」签发 Let’s Encrypt 或导入已有证书。'
                  : '换个关键词试试。'}
              </span>
            </span>
          }
        />
      )}

      {!canWrite && (
        <p className="text-xs text-muted">签发与上传需要 operator 角色,删除需要 admin。</p>
      )}

      {formOpen && (
        <CertFormModal
          canWrite={canWrite}
          onClose={() => setFormOpen(false)}
          onDone={(msg) => {
            setFeedback({ kind: 'ok', text: msg })
            setFormOpen(false)
            void load()
          }}
        />
      )}
      {settingsOpen && <SettingsModal isAdmin={isAdmin} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

/** 证书申请/上传弹窗:固定尺寸,内置 ACME 签发 / 自定义上传两个子 tab。 */
function CertFormModal({
  canWrite,
  onClose,
  onDone,
}: {
  canWrite: boolean
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [tab, setTab] = useState<'issue' | 'upload'>('issue')
  const [issue, setIssue] = useState<IssueForm>(emptyIssue)
  const [upload, setUpload] = useState<UploadForm>(emptyUpload)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submitIssue() {
    const domains = parseDomains(issue.domains)
    if (domains.length === 0 || !canWrite) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/ssl/certs', {
        method: 'POST',
        body: JSON.stringify({
          domains,
          challenge: issue.challenge,
          webroot: issue.webroot.trim(),
          dns_plugin: issue.dns_plugin.trim(),
        }),
      })
      onDone('证书签发已提交')
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function submitUpload() {
    const domains = parseDomains(upload.domains)
    if (domains.length === 0 || !upload.cert.trim() || !upload.key.trim() || !canWrite) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/ssl/certs/upload', {
        method: 'POST',
        body: JSON.stringify({ domains, cert: upload.cert, key: upload.key }),
      })
      onDone('自定义证书已上传')
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const issueDisabled = busy || !canWrite || parseDomains(issue.domains).length === 0
  const uploadDisabled =
    busy ||
    !canWrite ||
    parseDomains(upload.domains).length === 0 ||
    !upload.cert.trim() ||
    !upload.key.trim()

  return (
    <Modal title="申请 / 上传证书" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-0.5 rounded-(--radius-sm) border border-border bg-surface p-0.5">
          {(['issue', 'upload'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-9 flex-1 rounded-sm px-3 text-[13px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                tab === t
                  ? 'bg-surface-2 text-text'
                  : 'text-muted hover:bg-surface-2/60 hover:text-text'
              }`}
            >
              {t === 'issue' ? '申请证书 (ACME)' : '上传证书'}
            </button>
          ))}
        </div>

        {tab === 'issue' ? (
          <div className="flex flex-col gap-4">
            <Input
              label="域名"
              placeholder="多个用空格或逗号分隔"
              value={issue.domains}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setIssue((f) => ({ ...f, domains: e.target.value }))}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">验证方式</span>
              <select
                value={issue.challenge}
                onChange={(e) => setIssue((f) => ({ ...f, challenge: e.target.value as Challenge }))}
                className={selectClass}
              >
                <option value="webroot">webroot</option>
                <option value="standalone">standalone</option>
                <option value="dns">dns</option>
              </select>
            </label>
            {issue.challenge === 'webroot' && (
              <Input
                label="webroot 路径"
                placeholder="可选,覆盖默认"
                value={issue.webroot}
                spellCheck={false}
                onChange={(e) => setIssue((f) => ({ ...f, webroot: e.target.value }))}
              />
            )}
            {issue.challenge === 'dns' && (
              <Input
                label="DNS 插件"
                placeholder="留空为手动"
                value={issue.dns_plugin}
                spellCheck={false}
                onChange={(e) => setIssue((f) => ({ ...f, dns_plugin: e.target.value }))}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Input
              label="域名"
              placeholder="多个用空格或逗号分隔"
              value={upload.domains}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setUpload((f) => ({ ...f, domains: e.target.value }))}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">证书 PEM(全链)</span>
              <textarea
                value={upload.cert}
                onChange={(e) => setUpload((f) => ({ ...f, cert: e.target.value }))}
                spellCheck={false}
                placeholder="-----BEGIN CERTIFICATE-----"
                className="h-32 w-full resize-y rounded-(--radius-sm) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">私钥 PEM</span>
              <textarea
                value={upload.key}
                onChange={(e) => setUpload((f) => ({ ...f, key: e.target.value }))}
                spellCheck={false}
                placeholder="-----BEGIN PRIVATE KEY-----"
                className="h-32 w-full resize-y rounded-(--radius-sm) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              />
            </label>
          </div>
        )}

        {err && <p className="text-sm text-crit">{err}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          {tab === 'issue' ? (
            <Button disabled={issueDisabled} onClick={() => void submitIssue()}>
              申请
            </Button>
          ) : (
            <Button disabled={uploadDisabled} onClick={() => void submitUpload()}>
              上传并启用
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** 证书路径设置弹窗:证书目录 / ACME 目录 / 默认 webroot,仅 admin 可改。 */
function SettingsModal({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<SslSettings>(emptySettings)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        setSettings(await apiFetch<SslSettings>('/api/m/ssl/settings'))
      } catch (e) {
        setErr(errorText(e))
      }
    })()
  }, [])

  async function save() {
    if (!isAdmin) return
    setBusy(true)
    setErr(null)
    setOk(false)
    try {
      await apiFetch('/api/m/ssl/settings', {
        method: 'PUT',
        body: JSON.stringify({
          cert_dir: settings.cert_dir.trim(),
          acme_dir: settings.acme_dir.trim(),
          webroot: settings.webroot.trim(),
        }),
      })
      setOk(true)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="SSL 设置" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="证书目录"
          value={settings.cert_dir}
          spellCheck={false}
          disabled={!isAdmin}
          onChange={(e) => setSettings((s) => ({ ...s, cert_dir: e.target.value }))}
        />
        <Input
          label="ACME 目录"
          value={settings.acme_dir}
          spellCheck={false}
          disabled={!isAdmin}
          onChange={(e) => setSettings((s) => ({ ...s, acme_dir: e.target.value }))}
        />
        <Input
          label="默认 webroot"
          value={settings.webroot}
          spellCheck={false}
          disabled={!isAdmin}
          onChange={(e) => setSettings((s) => ({ ...s, webroot: e.target.value }))}
        />
        {settings.backend && <p className="text-xs text-muted">ACME 后端:{settings.backend}</p>}
        {!isAdmin && <p className="text-xs text-muted">设置需要 admin 角色。</p>}
        {err && <p className="text-sm text-crit">{err}</p>}
        {ok && <p className="text-sm text-online">设置已保存</p>}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button disabled={!isAdmin || busy} onClick={() => void save()}>
            保存设置
          </Button>
        </div>
      </div>
    </Modal>
  )
}
