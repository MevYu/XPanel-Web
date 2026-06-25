import { useEffect, useMemo, useState } from 'react'
import { Search, ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import { apiFetch } from '../api/client'
import { IconButton } from '../components/IconButton'
import { Table, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
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
const PAGE_SIZES = [20, 50, 100] as const

/** Logs 审计日志:aaPanel 风格 —— 工具栏(操作类型下拉 + 前缀搜索)+ 紧凑表 + EmptyState + 底部分页(共 N 条/每页条数/上下页)。后端 action 走前缀过滤,admin-only。 */
export default function Logs() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[1])
  const [action, setAction] = useState('')
  const [scope, setScope] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setErr(null)
    apiFetch<Resp>(
      `/api/audit?limit=${pageSize}&offset=${offset}${action ? `&action=${encodeURIComponent(action)}` : ''}`,
    )
      .then((r) => {
        setEntries(r.entries ?? [])
        setTotal(r.total ?? 0)
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [offset, action, pageSize])

  // 操作类型下拉:后端无 distinct 端点,故从当前页 action 的顶层命名空间(首个 `.` 前)归集,贴合前缀过滤。
  const scopes = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) {
      const top = e.action.split('.')[0]
      if (top) set.add(top)
    }
    return [...set].sort()
  }, [entries])

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
      key: 'user',
      header: '用户',
      width: '80px',
      cell: (e) => <span className="text-xs text-muted">{e.user_id ?? '系统'}</span>,
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
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={scope}
            onChange={(ev) => {
              const v = ev.target.value
              setScope(v)
              setQuery('')
              setOffset(0)
              setAction(v)
            }}
            className="h-10 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            aria-label="按操作类型过滤"
          >
            <option value="">全部操作</option>
            {scopes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <form
          className="relative w-72"
          onSubmit={(ev) => {
            ev.preventDefault()
            setScope('')
            setOffset(0)
            setAction(query.trim())
          }}
        >
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按操作前缀过滤,如 files / database,回车"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </form>
      </div>

      {err && (
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {err}
        </p>
      )}

      {loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : (
        <>
          <Table
            columns={columns}
            rows={entries}
            rowKey={(e) => `${e.ts}-${e.action}-${e.source_ip}-${e.detail.slice(0, 16)}`}
            emptyText={
              <EmptyState
                icon={<ScrollText />}
                title={action ? '没有匹配的日志' : '暂无审计日志'}
                hint={action ? '换个操作类型或前缀试试。' : '面板操作产生后会记录在此。'}
              />
            }
          />
          {total > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
              <span className="tabular-nums">共 {total} 条</span>
              <select
                value={pageSize}
                onChange={(ev) => {
                  setPageSize(Number(ev.target.value))
                  setOffset(0)
                }}
                aria-label="每页条数"
                className="h-8 rounded-(--radius-sm) border border-border bg-surface-2 px-2 text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} 条/页
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <IconButton
                  aria-label="上一页"
                  className="h-8 w-8"
                  disabled={offset === 0}
                  icon={<ChevronLeft size={16} />}
                  onClick={() => setOffset(Math.max(0, offset - pageSize))}
                />
                <span className="tabular-nums px-1">
                  {Math.floor(offset / pageSize) + 1} / {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <IconButton
                  aria-label="下一页"
                  className="h-8 w-8"
                  disabled={offset + entries.length >= total}
                  icon={<ChevronRight size={16} />}
                  onClick={() => setOffset(offset + pageSize)}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
