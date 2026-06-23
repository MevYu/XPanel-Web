import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Search } from 'lucide-react'
import { apiFetch } from '../api/client'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { EmptyState } from '../components/EmptyState'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'

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

/** sslExpiryCell 渲染证书到期:无证书 —;否则按剩余天数着色(<15 天 warn,过期 crit)。 */
function sslExpiryCell(expires?: number) {
  if (!expires) return <span className="text-xs text-faint">—</span>
  const days = Math.floor((expires * 1000 - Date.now()) / 86_400_000)
  const status = days < 0 ? 'crit' : days < 15 ? 'warn' : 'online'
  const text = days < 0 ? '已过期' : `${days} 天`
  return (
    <span className={`text-xs ${status === 'crit' ? 'text-crit' : status === 'warn' ? 'text-warn' : 'text-muted'}`}>
      {text}
    </span>
  )
}

/** Domains 域名总览:聚合各站点的域名 + SSL 状态(对标 aaPanel 列表骨架;纯前端,数据取自网站模块)。 */
export default function Domains() {
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')

  function load() {
    setErr(null)
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
  }

  useEffect(load, [])

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
    { key: 'site', header: '所属站点', cell: (r) => <span className="text-muted">{r.site}</span> },
    {
      key: 'kind',
      header: '类型',
      width: '90px',
      cell: (r) => <span className="text-muted">{KIND_LABEL[r.kind] ?? r.kind}</span>,
    },
    {
      key: 'ssl',
      header: 'SSL',
      width: '84px',
      cell: (r) =>
        r.sslOn ? <Badge status="online">已启用</Badge> : <span className="text-xs text-faint">未启用</span>,
    },
    {
      key: 'expires',
      header: '到期',
      width: '84px',
      cell: (r) => sslExpiryCell(r.expires),
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
        <span className="text-sm text-muted">共 {rows.length} 个域名</span>
        <div className="relative w-56">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索域名或站点"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
      </div>

      {err && rows.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {err}
          <Button size="sm" variant="ghost" onClick={load}>
            重试
          </Button>
        </p>
      )}

      {loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : (
        <Table
          columns={columns}
          rows={visible}
          rowKey={(r) => `${r.siteId}-${r.domain}`}
          emptyText={
            <EmptyState
              icon={<Globe />}
              title={rows.length === 0 ? '还没有域名' : '没有匹配的域名'}
              hint={
                rows.length === 0
                  ? '在「网站」模块添加站点后,域名会自动汇总到这里。'
                  : '换个关键词试试。'
              }
            />
          }
        />
      )}
    </div>
  )
}
