import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Search } from 'lucide-react'
import { apiFetch } from '../api/client'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { formatTime } from '../lib/formatTime'

interface Site {
  id: number
  name: string
  domains: string[]
  kind: string
  ssl: { ssl_enabled: boolean; expires_at?: number }
}

interface Row {
  domain: string
  site: string
  siteId: number
  kind: string
  sslOn: boolean
  expires?: number
}

function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message.trim() : ''
  return m || '加载失败'
}

const KIND_LABEL: Record<string, string> = { static: '静态', php: 'PHP', proxy: '反向代理' }

/** Domains 域名总览:聚合各站点的域名 + SSL 状态(对标设计稿 Domains;纯前端,数据取自网站模块)。 */
export default function Domains() {
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    apiFetch<Site[]>('/api/m/sites/sites')
      .then((sites) => {
        const out: Row[] = []
        for (const s of sites) {
          for (const d of s.domains ?? []) {
            out.push({
              domain: d,
              site: s.name,
              siteId: s.id,
              kind: s.kind,
              sslOn: !!s.ssl?.ssl_enabled,
              expires: s.ssl?.expires_at,
            })
          }
        }
        setRows(out)
      })
      .catch((e) => setErr(errorText(e)))
      .finally(() => setLoading(false))
  }, [])

  const visible = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? rows.filter((r) => r.domain.toLowerCase().includes(k) || r.site.toLowerCase().includes(k)) : rows
  }, [rows, q])

  const columns: Column<Row>[] = [
    {
      key: 'domain',
      header: '域名',
      cell: (r) => (
        <span className="inline-flex items-center gap-2 font-medium text-text">
          <Globe size={15} className="shrink-0 text-muted" />
          <span className="truncate font-[family-name:var(--font-mono)]">{r.domain}</span>
        </span>
      ),
    },
    { key: 'site', header: '站点', cell: (r) => <span className="text-muted">{r.site}</span> },
    {
      key: 'kind',
      header: '类型',
      width: '100px',
      cell: (r) => <span className="text-muted">{KIND_LABEL[r.kind] ?? r.kind}</span>,
    },
    {
      key: 'ssl',
      header: 'SSL',
      width: '110px',
      cell: (r) =>
        r.sslOn ? <Badge status="online">已启用</Badge> : <span className="text-xs text-faint">未启用</span>,
    },
    {
      key: 'expires',
      header: '证书到期',
      width: '160px',
      cell: (r) => (
        <span className="text-xs text-muted">{r.expires ? formatTime(r.expires) : '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '90px',
      align: 'right',
      cell: () => (
        <ActionLinks>
          <ActionLink onClick={() => nav('/sites')}>管理</ActionLink>
        </ActionLinks>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">
          共 {rows.length} 个域名
        </span>
        <div className="relative w-64">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索域名或站点"
            className="h-9 w-full rounded-(--radius-sm) border border-border bg-surface-2/70 pl-9 pr-3 text-sm text-text outline-none focus:border-brand"
          />
        </div>
      </div>
      {err ? (
        <Card className="text-sm text-crit">{err}</Card>
      ) : loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : (
        <Table
          columns={columns}
          rows={visible}
          rowKey={(r) => `${r.siteId}-${r.domain}`}
          emptyText={rows.length === 0 ? '还没有域名 — 在「网站」模块添加站点' : '没有匹配的域名'}
        />
      )}
    </div>
  )
}
