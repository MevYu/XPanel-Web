import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { type Site, PHP_VERSIONS, errorText, fieldClass } from '../shared'
import { TabSection, Labeled, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

/** PhpTab PHP 版本:切换 fpm 版本,PUT /php(仅 php 站点)。 */
export function PhpTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data, loading } = useTabResource<{ php_version: string }>(
    `/api/m/sites/sites/${site.id}/php`,
    { php_version: site.php_version },
  )
  const [version, setVersion] = useState(site.php_version)
  const [synced, setSynced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (!loading && !synced) {
    setVersion(data.php_version)
    setSynced(true)
  }
  if (loading) return <TabLoading />

  // 当前值不在预设档时,补一个选项避免下拉错位。
  const options = version && !PHP_VERSIONS.includes(version) ? [version, ...PHP_VERSIONS] : PHP_VERSIONS

  async function save() {
    if (!canWrite) return
    setBusy(true)
    setMsg(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/php`, {
        method: 'PUT',
        body: JSON.stringify({ php_version: version }),
      })
      onChanged(updated)
      setMsg({ kind: 'ok', text: `PHP 版本已切换为 ${version}` })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="PHP 版本" desc="决定 fastcgi 连接的 PHP-FPM 套接字。">
      <Labeled label="PHP 版本">
        <select
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          disabled={!canWrite}
          className={fieldClass}
        >
          {options.map((v) => (
            <option key={v} value={v}>
              PHP {v}
            </option>
          ))}
        </select>
      </Labeled>
      <Feedback msg={msg} />
      {canWrite && <SaveBar onSave={() => void save()} busy={busy} hint="保存后经 nginx -t 校验,失败不生效。" />}
    </TabSection>
  )
}
