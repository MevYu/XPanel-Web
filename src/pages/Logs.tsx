import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { apiFetch } from '../api/client'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Table, type Column } from '../components/Table'
import { formatTime } from '../lib/formatTime'

interface Entry {
  ts: number
  user_id: number | null
  action: string
  detail: string
  source_ip: string
}
interface Resp {
  entries: Entry[]
  total: number
}
const PAGE = 50

/** Logs 审计日志:面板操作流水(对标设计稿 Logs 的 Operation 视图),时间/操作/用户/详情/来源 IP + 前缀过滤 + 分页。 */
export default function Logs() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [action, setAction] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setErr(null)
    apiFetch<Resp>(
      `/api/audit?limit=${PAGE}&offset=${offset}${action ? `&action=${encodeURIComponent(action)}` : ''}`,
    )
      .then((r) => {
        setEntries(r.entries ?? [])
        setTotal(r.total ?? 0)
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [offset, action])

  const columns: Column<Entry>[] = [
    {
      key: 'ts',
      header: '时间',
      width: '160px',
      cell: (e) => (
        <span className="font-[family-name:var(--font-mono)] text-xs text-muted">{formatTime(e.ts)}</span>
      ),
    },
    {
      key: 'action',
      header: '操作',
      width: '200px',
      cell: (e) => (
        <span className="inline-flex items-center rounded-(--radius-sm) bg-surface-2 px-2 py-0.5 font-[family-name:var(--font-mono)] text-xs text-brand">
          {e.action}
        </span>
      ),
    },
    {
      key: 'user',
      header: '用户',
      width: '80px',
      cell: (e) => <span className="text-xs text-muted">{e.user_id ?? '系统'}</span>,
    },
    {
      key: 'detail',
      header: '详情',
      cell: (e) => (
        <span className="block truncate text-xs text-muted" title={e.detail}>
          {e.detail || '—'}
        </span>
      ),
    },
    {
      key: 'ip',
      header: '来源 IP',
      width: '150px',
      cell: (e) => (
        <span className="font-[family-name:var(--font-mono)] text-xs text-faint">{e.source_ip || '—'}</span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">审计日志 · 共 {total} 条</span>
        <form
          className="relative w-72"
          onSubmit={(ev) => {
            ev.preventDefault()
            setOffset(0)
            setAction(query.trim())
          }}
        >
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按操作前缀过滤,如 files / database,回车"
            className="h-9 w-full rounded-(--radius-sm) border border-border bg-surface-2/70 pl-9 pr-3 text-sm text-text outline-none focus:border-brand"
          />
        </form>
      </div>
      {err ? (
        <Card className="text-sm text-crit">{err}</Card>
      ) : loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : (
        <>
          <Table
            columns={columns}
            rows={entries}
            rowKey={(e) => `${e.ts}-${e.action}-${e.source_ip}-${e.detail.slice(0, 16)}`}
            emptyText="暂无日志"
          />
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              上一页
            </Button>
            <span className="text-xs tabular-nums text-muted">
              {total === 0 ? 0 : offset + 1}–{Math.min(offset + entries.length, total)} / {total}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={offset + entries.length >= total}
              onClick={() => setOffset(offset + PAGE)}
            >
              下一页
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
