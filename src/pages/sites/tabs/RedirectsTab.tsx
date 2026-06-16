import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Plus, X } from 'lucide-react'
import { type Site, type Redirect, errorText, fieldClass } from '../shared'
import { TabSection, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

/** RedirectsTab 重定向:301/302 列表整体 PUT。 */
export function RedirectsTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data, loading } = useTabResource<Redirect[]>(
    `/api/m/sites/sites/${site.id}/redirects`,
    site.redirects ?? [],
  )
  const [rows, setRows] = useState<Redirect[]>(site.redirects ?? [])
  const [synced, setSynced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (!loading && !synced) {
    setRows(data)
    setSynced(true)
  }
  if (loading) return <TabLoading />

  function setRow(i: number, patch: Partial<Redirect>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  const valid = rows.every((r) => r.from.trim() && r.to.trim())

  async function save() {
    if (!canWrite || !valid) return
    setBusy(true)
    setMsg(null)
    try {
      const redirects = rows.map((r) => ({ from: r.from.trim(), to: r.to.trim(), code: r.code || 301 }))
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/redirects`, {
        method: 'PUT',
        body: JSON.stringify({ redirects }),
      })
      onChanged(updated)
      setMsg({ kind: 'ok', text: '重定向规则已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="重定向" desc="把来源路径前缀 301 / 302 跳转到目标。">
      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-xs text-muted">暂无重定向规则。</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={r.from}
              onChange={(e) => setRow(i, { from: e.target.value })}
              placeholder="/old"
              spellCheck={false}
              disabled={!canWrite}
              className={`${fieldClass} min-w-32 flex-1 font-[family-name:var(--font-mono)]`}
            />
            <span className="text-muted">→</span>
            <input
              value={r.to}
              onChange={(e) => setRow(i, { to: e.target.value })}
              placeholder="https://example.com/new"
              spellCheck={false}
              disabled={!canWrite}
              className={`${fieldClass} min-w-40 flex-[2] font-[family-name:var(--font-mono)]`}
            />
            <select
              value={r.code || 301}
              onChange={(e) => setRow(i, { code: Number(e.target.value) })}
              disabled={!canWrite}
              className={`${fieldClass} w-24`}
            >
              <option value={301}>301</option>
              <option value={302}>302</option>
            </select>
            <button
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              disabled={!canWrite}
              aria-label="移除规则"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-crit/10 hover:text-crit disabled:cursor-not-allowed disabled:opacity-30"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => setRows((rs) => [...rs, { from: '', to: '', code: 301 }])}
        disabled={!canWrite}
        className="inline-flex w-fit items-center gap-1.5 rounded-(--radius-card) border border-dashed border-border px-3 py-2 text-sm text-muted transition hover:border-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={14} />
        添加规则
      </button>
      <Feedback msg={msg} />
      {canWrite && <SaveBar onSave={() => void save()} busy={busy} disabled={!valid} />}
    </TabSection>
  )
}
