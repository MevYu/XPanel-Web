import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Input } from '../../../components/Input'
import { type Site, type AntiLeech, errorText, splitList } from '../shared'
import { TabSection, SwitchRow, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

/** AntiLeechTab 防盗链:对命中扩展名的请求校验 Referer 白名单。 */
export function AntiLeechTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data, loading } = useTabResource<AntiLeech>(
    `/api/m/sites/sites/${site.id}/anti-leech`,
    site.anti_leech ?? { enabled: false, extensions: [], allowed_referers: [] },
  )
  const [enabled, setEnabled] = useState(site.anti_leech?.enabled ?? false)
  const [exts, setExts] = useState((site.anti_leech?.extensions ?? []).join(' '))
  const [refs, setRefs] = useState((site.anti_leech?.allowed_referers ?? []).join(' '))
  const [synced, setSynced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (!loading && !synced) {
    setEnabled(data.enabled)
    setExts((data.extensions ?? []).join(' '))
    setRefs((data.allowed_referers ?? []).join(' '))
    setSynced(true)
  }
  if (loading) return <TabLoading />

  const extList = splitList(exts)
  const canSave = !enabled || extList.length > 0

  async function save() {
    if (!canWrite || !canSave) return
    setBusy(true)
    setMsg(null)
    try {
      const body: AntiLeech = {
        enabled,
        extensions: extList,
        allowed_referers: splitList(refs),
      }
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/anti-leech`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      onChanged(updated)
      setMsg({ kind: 'ok', text: '防盗链配置已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="防盗链" desc="命中扩展名的请求会校验 Referer,非白名单来源返回 403。">
      <SwitchRow label="启用防盗链" checked={enabled} onChange={setEnabled} disabled={!canWrite} />
      <Input
        label="受保护扩展名"
        placeholder="jpg png gif mp4(不含点,空格分隔)"
        value={exts}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="font-[family-name:var(--font-mono)]"
        disabled={!canWrite || !enabled}
        error={enabled && extList.length === 0 ? '至少填一个扩展名' : undefined}
        onChange={(e) => setExts(e.target.value)}
      />
      <Input
        label="允许的来源主机"
        placeholder="example.com www.example.com(空格分隔,留空仅允许空 Referer)"
        value={refs}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="font-[family-name:var(--font-mono)]"
        disabled={!canWrite || !enabled}
        onChange={(e) => setRefs(e.target.value)}
      />
      <Feedback msg={msg} />
      {canWrite && <SaveBar onSave={() => void save()} busy={busy} disabled={!canSave} />}
    </TabSection>
  )
}
