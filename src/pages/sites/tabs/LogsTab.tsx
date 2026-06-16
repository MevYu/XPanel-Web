import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Button } from '../../../components/Button'
import { Spinner } from '../../../components/Spinner'
import { RefreshCw } from 'lucide-react'
import { type Site, errorText, fieldClass } from '../shared'

type LogType = 'access' | 'error'

/** LogsTab 日志:读 access / error 日志尾部 N 行。 */
export function LogsTab({ site }: { site: Site }) {
  const [type, setType] = useState<LogType>('access')
  const [tail, setTail] = useState(200)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await apiFetch<{ content: string }>(
        `/api/m/sites/sites/${site.id}/logs?type=${type}&tail=${tail}`,
      )
      setContent(res.content ?? '')
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [site.id, type, tail])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-(--radius-card) border border-border bg-surface p-1">
          {(['access', 'error'] as LogType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`h-8 rounded-(--radius-card) px-3 text-sm font-medium transition outline-none ${
                type === t ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
              }`}
            >
              {t === 'access' ? '访问日志' : '错误日志'}
            </button>
          ))}
        </div>
        <select
          value={tail}
          onChange={(e) => setTail(Number(e.target.value))}
          className={`${fieldClass} h-8 w-28`}
        >
          {[100, 200, 500, 1000].map((n) => (
            <option key={n} value={n}>
              末 {n} 行
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} />
          刷新
        </Button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-(--radius-card) border border-border bg-surface-2">
          <Spinner size={22} />
        </div>
      ) : err ? (
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {err}
        </p>
      ) : content.trim() === '' ? (
        <div className="flex h-64 items-center justify-center rounded-(--radius-card) border border-dashed border-border text-sm text-muted">
          日志为空。
        </div>
      ) : (
        <pre className="max-h-[56vh] overflow-auto rounded-(--radius-card) border border-border bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text">
          {content}
        </pre>
      )}
    </div>
  )
}
