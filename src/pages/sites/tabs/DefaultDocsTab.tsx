import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Input } from '../../../components/Input'
import { type Site, errorText, splitList } from '../shared'
import { TabSection, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

/** DefaultDocsTab 默认文档:有序的 index 文件列表,PUT /default-docs。 */
export function DefaultDocsTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data, loading } = useTabResource<{ index_docs: string[] }>(
    `/api/m/sites/sites/${site.id}/default-docs`,
    { index_docs: site.index_docs ?? [] },
  )
  const [raw, setRaw] = useState((site.index_docs ?? []).join(' '))
  const [synced, setSynced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (!loading && !synced) {
    setRaw((data.index_docs ?? []).join(' '))
    setSynced(true)
  }
  if (loading) return <TabLoading />

  const docs = splitList(raw)

  async function save() {
    if (!canWrite || docs.length === 0) return
    setBusy(true)
    setMsg(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/default-docs`, {
        method: 'PUT',
        body: JSON.stringify({ index_docs: docs }),
      })
      onChanged(updated)
      setMsg({ kind: 'ok', text: '默认文档已更新' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="默认文档" desc="按优先级匹配的首页文件,空格或逗号分隔。">
      <Input
        label="索引文件"
        placeholder="index.php index.html"
        value={raw}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="font-[family-name:var(--font-mono)]"
        disabled={!canWrite}
        onChange={(e) => setRaw(e.target.value)}
      />
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {docs.map((d, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 font-[family-name:var(--font-mono)] text-xs text-muted"
            >
              <span className="text-text/60">{i + 1}</span>
              {d}
            </span>
          ))}
        </div>
      )}
      <Feedback msg={msg} />
      {canWrite && <SaveBar onSave={() => void save()} busy={busy} disabled={docs.length === 0} />}
    </TabSection>
  )
}
