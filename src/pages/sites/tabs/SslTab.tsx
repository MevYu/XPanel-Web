import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Input } from '../../../components/Input'
import { type Site, type SSL, errorText, textareaClass, formatTime } from '../shared'
import { TabSection, SwitchRow, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

/** SslTab SSL:Let's Encrypt 一键签发 + 上传 PEM(只写不回显)+ 强制 HTTPS + HSTS。 */
export function SslTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data: ssl, loading } = useTabResource<SSL>(`/api/m/sites/sites/${site.id}/ssl`, site.ssl)
  const [enabled, setEnabled] = useState(site.ssl?.ssl_enabled ?? false)
  const [forceHttps, setForceHttps] = useState(site.ssl?.force_https ?? false)
  const [hsts, setHsts] = useState(site.ssl?.hsts ?? false)
  const [certPem, setCertPem] = useState('')
  const [keyPem, setKeyPem] = useState('')
  const [synced, setSynced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // ACME 一键申请
  const [email, setEmail] = useState('')
  const [acmeDomains, setAcmeDomains] = useState<string[]>(site.domains)
  const [acmeBusy, setAcmeBusy] = useState(false)
  const [acmeMsg, setAcmeMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // 首次拿到服务端 SSL 后同步开关初值(PEM 不回显)。
  if (!loading && !synced) {
    setEnabled(ssl.ssl_enabled)
    setForceHttps(ssl.force_https)
    setHsts(ssl.hsts)
    setSynced(true)
  }

  if (loading) return <TabLoading />

  const hasCert = Boolean(ssl.cert_path)
  // 启用且当前无证书时,必须上传一对新 PEM。
  const needPem = enabled && !hasCert
  const canSave = !enabled || hasCert || (certPem.trim() && keyPem.trim())

  function toggleDomain(d: string) {
    setAcmeDomains((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))
  }

  const acmeValid = /.+@.+\..+/.test(email.trim()) && acmeDomains.length > 0

  async function requestAcme() {
    if (!canWrite || !acmeValid) return
    setAcmeBusy(true)
    setAcmeMsg(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/ssl/acme`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), domains: acmeDomains }),
      })
      onChanged(updated)
      setSynced(false)
      setAcmeMsg({ kind: 'ok', text: '证书已签发,自动续期已开启' })
    } catch (e) {
      setAcmeMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setAcmeBusy(false)
    }
  }

  async function save() {
    if (!canWrite || !canSave) return
    setBusy(true)
    setMsg(null)
    try {
      const body: Record<string, unknown> = {
        ssl_enabled: enabled,
        force_https: forceHttps,
        hsts,
      }
      if (certPem.trim()) body.cert_pem = certPem.trim()
      if (keyPem.trim()) body.key_pem = keyPem.trim()
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/ssl`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      onChanged(updated)
      setCertPem('')
      setKeyPem('')
      setSynced(false)
      setMsg({ kind: 'ok', text: 'SSL 配置已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {(hasCert || ssl.expires_at > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-(--radius-card) border border-online/30 bg-online/10 px-4 py-3 text-xs text-online">
          <span>已安装证书</span>
          {ssl.expires_at > 0 && <span>到期 {formatTime(ssl.expires_at)}</span>}
          {ssl.auto_renew && <span>自动续期已开启</span>}
        </div>
      )}

      <TabSection
        title="自动申请 (Let's Encrypt)"
        desc="为选中域名签发免费证书并开启自动续期,需域名已正确解析到本机。"
      >
        <Input
          label="账户邮箱"
          type="email"
          placeholder="admin@example.com"
          value={email}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={!canWrite}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">签发域名</span>
          {site.domains.length === 0 ? (
            <p className="text-xs text-muted">该站点尚未绑定域名,请先在「域名」tab 添加。</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {site.domains.map((d) => (
                <label key={d} className="flex cursor-pointer items-center gap-2.5 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={acmeDomains.includes(d)}
                    onChange={() => toggleDomain(d)}
                    disabled={!canWrite}
                    className="h-4 w-4 accent-[var(--color-brand)]"
                  />
                  <span className="font-[family-name:var(--font-mono)] text-xs">{d}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <Feedback msg={acmeMsg} />
        {canWrite && (
          <SaveBar
            onSave={() => void requestAcme()}
            busy={acmeBusy}
            disabled={!acmeValid}
            label="申请证书"
            hint="签发可能耗时数十秒,请稍候。"
          />
        )}
      </TabSection>

      <TabSection title="TLS" desc="启用后 443 块生效;私钥仅写入服务器,不回显。">
        <SwitchRow label="启用 SSL" checked={enabled} onChange={setEnabled} disabled={!canWrite} />
        <SwitchRow
          label="强制 HTTPS"
          desc="80 端口 301 跳转到 443。"
          checked={forceHttps}
          onChange={setForceHttps}
          disabled={!canWrite || !enabled}
        />
        <SwitchRow
          label="HSTS"
          desc="为 443 响应加 Strict-Transport-Security 头。"
          checked={hsts}
          onChange={setHsts}
          disabled={!canWrite || !enabled}
        />
        {hasCert && (
          <p className="rounded-(--radius-card) border border-online/30 bg-online/10 px-3 py-2 text-xs text-online">
            已安装证书。重新上传以替换;留空则沿用现有证书。
          </p>
        )}
      </TabSection>

      {enabled && (
        <TabSection
          title="上传证书"
          desc={needPem ? '尚未安装证书,请粘贴 PEM 证书与私钥。' : '粘贴新的 PEM 以替换现有证书(可留空)。'}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">证书 (PEM,含证书链)</span>
            <textarea
              value={certPem}
              onChange={(e) => setCertPem(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----"
              spellCheck={false}
              disabled={!canWrite}
              className={`${textareaClass} h-32`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">私钥 (PEM,只写不回显)</span>
            <textarea
              value={keyPem}
              onChange={(e) => setKeyPem(e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY-----"
              spellCheck={false}
              disabled={!canWrite}
              className={`${textareaClass} h-32`}
            />
          </label>
        </TabSection>
      )}

      <Feedback msg={msg} />
      {canWrite && (
        <SaveBar
          onSave={() => void save()}
          busy={busy}
          disabled={!canSave}
          hint="保存后经 nginx -t 校验,失败不生效。"
        />
      )}
    </div>
  )
}
