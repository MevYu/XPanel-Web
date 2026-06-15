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

const selectClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

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

function expiryInfo(notAfter: number): { text: string; status: 'online' | 'warn' | 'crit' | 'neutral' } {
  if (!notAfter) return { text: '未知', status: 'neutral' }
  const now = Date.now() / 1000
  const days = Math.floor((notAfter - now) / DAY)
  const text = new Date(notAfter * 1000).toLocaleDateString()
  if (days < 0) return { text: `${text} · 已过期`, status: 'crit' }
  if (days <= 15) return { text: `${text} · ${days} 天后到期`, status: 'crit' }
  if (days <= 30) return { text: `${text} · ${days} 天后到期`, status: 'warn' }
  return { text: `${text} · ${days} 天后到期`, status: 'online' }
}

/** Ssl 证书:列出证书与到期,签发(ACME)/上传自定义/续期/批量续期/删除,自动续期开关与设置。 */
export default function Ssl() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [certs, setCerts] = useState<Cert[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [issue, setIssue] = useState<IssueForm>(emptyIssue)
  const [upload, setUpload] = useState<UploadForm>(emptyUpload)
  const [tab, setTab] = useState<'issue' | 'upload'>('issue')

  const [settings, setSettings] = useState<SslSettings>(emptySettings)
  const [showSettings, setShowSettings] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const data = await apiFetch<Cert[]>('/api/m/ssl/certs')
      setCerts(data)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function parseDomains(s: string): string[] {
    return s
      .split(/[\s,]+/)
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
  }

  async function submitIssue() {
    const domains = parseDomains(issue.domains)
    if (domains.length === 0 || !canWrite) return
    setBusy(true)
    setFeedback(null)
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
      setFeedback({ kind: 'ok', text: '证书签发已提交' })
      setIssue(emptyIssue)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function submitUpload() {
    const domains = parseDomains(upload.domains)
    if (domains.length === 0 || !upload.cert.trim() || !upload.key.trim() || !canWrite) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/ssl/certs/upload', {
        method: 'POST',
        body: JSON.stringify({ domains, cert: upload.cert, key: upload.key }),
      })
      setFeedback({ kind: 'ok', text: '自定义证书已上传' })
      setUpload(emptyUpload)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

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

  async function openSettings() {
    if (showSettings) {
      setShowSettings(false)
      return
    }
    setShowSettings(true)
    try {
      const s = await apiFetch<SslSettings>('/api/m/ssl/settings')
      setSettings(s)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function saveSettings() {
    if (!isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/ssl/settings', {
        method: 'PUT',
        body: JSON.stringify({
          cert_dir: settings.cert_dir.trim(),
          acme_dir: settings.acme_dir.trim(),
          webroot: settings.webroot.trim(),
        }),
      })
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={tab === 'issue' ? 'primary' : 'ghost'}
            onClick={() => setTab('issue')}
          >
            签发证书
          </Button>
          <Button
            size="sm"
            variant={tab === 'upload' ? 'primary' : 'ghost'}
            onClick={() => setTab('upload')}
          >
            上传证书
          </Button>
        </div>

        {tab === 'issue' ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                  onChange={(e) =>
                    setIssue((f) => ({ ...f, challenge: e.target.value as Challenge }))
                  }
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
            <div className="flex items-center gap-2">
              <Button
                onClick={() => void submitIssue()}
                disabled={busy || !canWrite || parseDomains(issue.domains).length === 0}
              >
                签发
              </Button>
              {busy && <Spinner size={16} />}
            </div>
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
                className="h-32 w-full resize-y rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">私钥 PEM</span>
              <textarea
                value={upload.key}
                onChange={(e) => setUpload((f) => ({ ...f, key: e.target.value }))}
                spellCheck={false}
                placeholder="-----BEGIN PRIVATE KEY-----"
                className="h-32 w-full resize-y rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              />
            </label>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => void submitUpload()}
                disabled={
                  busy ||
                  !canWrite ||
                  parseDomains(upload.domains).length === 0 ||
                  !upload.cert.trim() ||
                  !upload.key.trim()
                }
              >
                上传
              </Button>
              {busy && <Spinner size={16} />}
            </div>
          </div>
        )}

        {!canWrite && <p className="text-xs text-muted">签发与上传需要 operator 角色。</p>}
        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">证书列表</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => void renewDue()} disabled={!canWrite || busy}>
              续期到期证书
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void openSettings()}>
              {showSettings ? '收起设置' : '设置'}
            </Button>
          </div>
        </div>

        {showSettings && (
          <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-3">
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
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => void saveSettings()} disabled={!isAdmin || busy}>
                保存设置
              </Button>
              {settings.backend && (
                <span className="text-xs text-muted">ACME 后端:{settings.backend}</span>
              )}
            </div>
            {!isAdmin && <p className="text-xs text-muted">设置需要 admin 角色。</p>}
          </div>
        )}

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && certs.length === 0 ? (
          <p className="p-5 text-sm text-muted">{loadErr}</p>
        ) : certs.length === 0 ? (
          <p className="p-5 text-sm text-muted">暂无证书。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {certs.map((cert) => {
              const exp = expiryInfo(cert.not_after)
              return (
                <div key={cert.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{cert.domains}</span>
                      <Badge status={exp.status}>{exp.text}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>{cert.issuer}</span>
                      <span>{cert.challenge}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      自动续期
                      <Switch
                        checked={cert.auto_renew}
                        onChange={(next) => void toggleAuto(cert, next)}
                        disabled={!canWrite}
                        aria-label={`${cert.auto_renew ? '关闭' : '开启'}自动续期 ${cert.domains}`}
                      />
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void renew(cert)}
                      disabled={!canWrite || busy}
                    >
                      续期
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void remove(cert)}
                      disabled={!isAdmin || busy}
                      title={isAdmin ? undefined : '需要 admin 角色'}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
