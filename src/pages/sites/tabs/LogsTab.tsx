import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Button } from '../../../components/Button'
import { Spinner } from '../../../components/Spinner'
import { RefreshCw, Download } from 'lucide-react'
import { Switch } from '../../../components/Switch'
import { type Site, errorText, fieldClass, download } from '../shared'

type LogType = 'access' | 'error'

/** LogsTab 日志:读 access / error 尾部 + 下载 + 访问日志记录开关。 */
export function LogsTab({ site, canWrite }: { site: Site; canWrite: boolean }) {
  const base = `/api/m/sites/sites/${site.id}`
  const [type, setType] = useState<LogType>('access')
  const [tail, setTail] = useState(200)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [logEnabled, setLogEnabled] = useState(site.access_log !== '/dev/null')
  const [logBusy, setLogBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await apiFetch<{ content: string }>(`${base}/logs?type=${type}&tail=${tail}`)
      setContent(res.content ?? '')
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [base, type, tail])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleLog(next: boolean) {
    if (!canWrite) return
    setLogBusy(true)
    setErr(null)
    try {
      await apiFetch(`${base}/logs`, { method: 'PUT', body: JSON.stringify({ enabled: next }) })
      setLogEnabled(next)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLogBusy(false)
    }
  }

  async function doDownload(kind: LogType) {
    setErr(null)
    try {
      await download(`${base}/logs/${kind}/download`, `${site.name}-${kind}.log`)
    } catch (e) {
      setErr(errorText(e))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 rounded-(--radius-card) border border-border bg-surface p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-text">记录访问日志</span>
          <span className="text-xs text-muted">关闭后访问日志写入 /dev/null,不占用磁盘。</span>
        </div>
        <div className="flex items-center gap-2">
          {logBusy && <Spinner size={16} />}
          <Switch
            checked={logEnabled}
            onChange={(v) => void toggleLog(v)}
            disabled={!canWrite || logBusy}
            aria-label="记录访问日志"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-(--radius-card) border border-border bg-surface p-1">
          {(['access', 'error'] as LogType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`h-8 rounded-(--radius-card) px-3 text-sm font-medium transition outline-none ${
                type === t ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2/60 hover:text-text'
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
        <Button size="sm" variant="ghost" onClick={() => void doDownload(type)}>
          <Download size={14} />
          下载{type === 'access' ? '访问' : '错误'}日志
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
