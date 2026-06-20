import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { apiFetch } from '../../../api/client'
import { type Site, type ErrorPage, errorText, fieldClass } from '../shared'
import { TabSection, SaveBar, Feedback } from '../tabui'

const CODES = [400, 401, 403, 404, 500, 502, 503, 504]

/** ErrorPagesTab 自定义错误页:状态码 → 页面路径列表,整体 PUT(后端上限 16 条 + nginx -t 校验)。 */
export function ErrorPagesTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const [rows, setRows] = useState<ErrorPage[]>(site.error_pages ?? [])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const valid = rows.every((r) => r.path.trim())

  function setRow(i: number, patch: Partial<ErrorPage>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  async function save() {
    if (!canWrite || !valid) return
    setBusy(true)
    setMsg(null)
    try {
      const error_pages = rows.map((r) => ({ code: r.code || 404, path: r.path.trim() }))
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/error-pages`, {
        method: 'PUT',
        body: JSON.stringify({ error_pages }),
      })
      onChanged(updated)
      setMsg({ kind: 'ok', text: '错误页已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="自定义错误页" desc="为指定 HTTP 状态码指定页面文件(相对站点根或绝对路径)。">
      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-xs text-muted">暂无自定义错误页。</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              className={`${fieldClass} w-24`}
              value={r.code}
              disabled={!canWrite}
              onChange={(e) => setRow(i, { code: Number(e.target.value) })}
            >
              {CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className={`${fieldClass} flex-1`}
              value={r.path}
              disabled={!canWrite}
              placeholder="/404.html"
              spellCheck={false}
              onChange={(e) => setRow(i, { path: e.target.value })}
            />
            {canWrite && (
              <button
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                className="shrink-0 text-muted transition hover:text-crit"
                aria-label="删除"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        {canWrite && rows.length < 16 && (
          <button
            onClick={() => setRows((rs) => [...rs, { code: 404, path: '' }])}
            className="flex items-center gap-1 self-start text-sm text-muted transition hover:text-brand"
          >
            <Plus size={15} /> 添加
          </button>
        )}
        <Feedback msg={msg} />
        {canWrite && <SaveBar onSave={() => void save()} busy={busy} disabled={!valid} hint="保存后经 nginx -t 校验。" />}
      </div>
    </TabSection>
  )
}
