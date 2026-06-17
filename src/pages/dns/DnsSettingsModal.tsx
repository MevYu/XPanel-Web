import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { type Settings, PROVIDER_KINDS, errorText, fieldClass } from './shared'

/** DnsSettingsModal Provider 设置:provider 类型 / BIND 区文件目录 / 凭证(只写不回显)。仅 admin 可保存。 */
export function DnsSettingsModal({
  isAdmin,
  onClose,
  onSaved,
}: {
  isAdmin: boolean
  onClose: () => void
  onSaved: (s: Settings, credsSet: boolean) => void
}) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [credsSet, setCredsSet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    apiFetch<{ settings: Settings; creds_set: boolean }>('/api/m/dns/settings')
      .then((r) => {
        setSettings(r.settings)
        setCredsSet(r.creds_set)
      })
      .catch((e) => setErr(errorText(e)))
  }, [])

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s))
    setOk(false)
  }

  async function save() {
    if (!settings || busy || !isAdmin) return
    setBusy(true)
    setErr(null)
    try {
      const res = await apiFetch<{ settings: Settings; creds_set: boolean }>('/api/m/dns/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      const next = { ...res.settings, provider_creds: '' }
      setSettings(next)
      setCredsSet(res.creds_set)
      setOk(true)
      onSaved(next, res.creds_set)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="DNS 服务商设置" size="sm" onClose={onClose}>
      {!settings ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">provider 类型</span>
            <select
              value={settings.provider_kind}
              onChange={(e) => set('provider_kind', e.target.value)}
              disabled={!isAdmin}
              className={fieldClass}
            >
              {PROVIDER_KINDS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="BIND 区文件目录 (bind_zone_dir)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            disabled={!isAdmin}
            className="font-[family-name:var(--font-mono)]"
            value={settings.bind_zone_dir}
            onChange={(e) => set('bind_zone_dir', e.target.value)}
          />
          <Input
            label={`provider 凭证 (provider_creds)${credsSet ? ' · 已配置' : ''}`}
            type="password"
            autoComplete="off"
            disabled={!isAdmin}
            placeholder={credsSet ? '留空保持不变' : '云 provider API 凭证'}
            value={settings.provider_creds}
            onChange={(e) => set('provider_creds', e.target.value)}
          />
        </div>
      )}

      {err && <p className="mt-4 text-sm text-crit">{err}</p>}
      {ok && <p className="mt-4 text-sm text-online">设置已保存。</p>}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
        {isAdmin && (
          <Button onClick={() => void save()} disabled={!settings || busy}>
            {busy && <Spinner size={14} />}
            保存设置
          </Button>
        )}
      </div>
      {!isAdmin && <p className="mt-3 text-xs text-muted">修改 DNS 服务商设置需要 admin 角色。</p>}
    </Modal>
  )
}
