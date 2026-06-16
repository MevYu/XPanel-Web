import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { type Site, type SSL, errorText, textareaClass } from '../shared'
import { TabSection, SwitchRow, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

/** SslTab SSL:上传证书/私钥 PEM(只写不回显)+ 强制 HTTPS + HSTS。 */
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
          title="证书"
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
