import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Input } from '../../../components/Input'
import { type Site, errorText } from '../shared'
import { TabSection, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

/** ProxyTab 反向代理:编辑 upstream 目标,PUT /proxy(仅 proxy 站点)。 */
export function ProxyTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data, loading } = useTabResource<{ proxy_target: string }>(
    `/api/m/sites/sites/${site.id}/proxy`,
    { proxy_target: site.proxy_target },
  )
  const [target, setTarget] = useState(site.proxy_target)
  const [synced, setSynced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (!loading && !synced) {
    setTarget(data.proxy_target)
    setSynced(true)
  }
  if (loading) return <TabLoading />

  async function save() {
    if (!canWrite || !target.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/proxy`, {
        method: 'PUT',
        body: JSON.stringify({ proxy_target: target.trim() }),
      })
      onChanged(updated)
      setMsg({ kind: 'ok', text: '后端地址已更新' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="反向代理" desc="所有请求转发到该后端地址。">
      <Input
        label="后端地址 (upstream)"
        placeholder="http://127.0.0.1:3000"
        value={target}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        disabled={!canWrite}
        onChange={(e) => setTarget(e.target.value)}
      />
      <Feedback msg={msg} />
      {canWrite && <SaveBar onSave={() => void save()} busy={busy} disabled={!target.trim()} />}
    </TabSection>
  )
}
