import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Tabs } from '../components/Tabs'
import { IconButton } from '../components/IconButton'
import { EmptyState } from '../components/EmptyState'
import { Badge } from '../components/Badge'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Plus, Settings2, Search, Globe, Code2, Boxes } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { InstallGate } from '../components/InstallGate'
import { type Site, DANGER, errorText, kindLabel, formatTime } from './sites/shared'
import { SiteDrawer } from './sites/SiteDrawer'
import { CreateSiteModal } from './sites/CreateSiteModal'
import { SettingsModal } from './sites/SettingsModal'

type Filter = 'all' | 'php' | 'static' | 'proxy'

// 顶部页级 tab,对齐 aaPanel「PHP项目 / 静态 / 反向代理」分段:按站点类型切换列表。
const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'php', label: 'PHP 项目' },
  { key: 'static', label: '静态项目' },
  { key: 'proxy', label: '反向代理' },
]

const kindIcon: Record<string, LucideIcon> = { static: Globe, php: Code2, proxy: Boxes }

/** sslExpiryCell 渲染证书到期:无证书 —;否则按剩余天数着色(<15 天 warn,过期 crit)。 */
function sslExpiryCell(expires: number) {
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

/** Sites 网站管理:对齐 aaPanel 网站页骨架——顶部类型 tab、工具栏卡(左新建/右搜索)、紧凑数据表 + 文字行操作。 */
export default function Sites() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [openTab, setOpenTab] = useState<'overview' | 'backups'>('overview')

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setSites(await apiFetch<Site[]>('/api/m/sites/sites'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const upsert = useCallback((site: Site) => {
    setSites((prev) => {
      const i = prev.findIndex((s) => s.id === site.id)
      if (i === -1) return [...prev, site]
      const next = [...prev]
      next[i] = site
      return next
    })
  }, [])

  function open(site: Site, tab: 'overview' | 'backups' = 'overview') {
    setOpenTab(tab)
    setOpenId(site.id)
  }

  async function remove(site: Site) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除站点「${site.name}」?此操作危险,不可恢复。`)) return
    try {
      await apiFetch(`/api/m/sites/sites/${site.id}`, { method: 'DELETE', headers: DANGER })
      setSites((prev) => prev.filter((s) => s.id !== site.id))
      if (openId === site.id) setOpenId(null)
    } catch (e) {
      setLoadErr(errorText(e))
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sites.filter((s) => {
      if (filter !== 'all' && s.kind !== filter) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || s.domains.some((d) => d.includes(q))
    })
  }, [sites, query, filter])

  const openSite = openId == null ? null : (sites.find((s) => s.id === openId) ?? null)

  const columns: Column<Site>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '站点名',
        cell: (s) => {
          const Icon = kindIcon[s.kind] ?? Globe
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <button
                type="button"
                onClick={() => open(s)}
                className="inline-flex items-center gap-2 self-start rounded-sm font-medium text-text outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/60"
              >
                <Icon size={15} className="shrink-0 text-muted" />
                <span className="truncate">{s.name}</span>
              </button>
              <span className="truncate pl-[23px] font-[family-name:var(--font-mono)] text-[11px] text-faint">
                {s.root_dir || '—'}
              </span>
            </div>
          )
        },
      },
      {
        key: 'status',
        header: '状态',
        width: '92px',
        cell: (s) => (
          <Badge status={s.enabled ? 'online' : 'neutral'}>{s.enabled ? '运行中' : '已停用'}</Badge>
        ),
      },
      {
        key: 'kind',
        header: '类型',
        width: '90px',
        cell: (s) => <span className="text-muted">{kindLabel[s.kind] ?? s.kind}</span>,
      },
      {
        key: 'domains',
        header: '域名(端口)',
        cell: (s) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {s.domains.join(', ')}
            <span className="text-text/60"> :{s.listen}</span>
          </span>
        ),
      },
      {
        key: 'backup',
        header: '备份',
        width: '72px',
        cell: (s) => (
          <ActionLink onClick={() => open(s, 'backups')}>备份</ActionLink>
        ),
      },
      {
        key: 'expiry',
        header: '到期',
        width: '84px',
        cell: (s) => sslExpiryCell(s.ssl?.expires_at ?? 0),
      },
      {
        key: 'ssl',
        header: 'SSL',
        width: '84px',
        cell: (s) =>
          s.ssl?.ssl_enabled ? (
            <Badge status="online">已开启</Badge>
          ) : (
            <span className="text-xs text-faint">未启用</span>
          ),
      },
      {
        key: 'created',
        header: '创建时间',
        width: '150px',
        cell: (s) => <span className="text-xs text-muted">{formatTime(s.created_at)}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '120px',
        align: 'right',
        cell: (s) => (
          <ActionLinks>
            <ActionLink onClick={() => open(s)}>设置</ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin}
              aria-label="删除站点"
              title={isAdmin ? '删除站点' : '需要 admin 角色'}
              onClick={() => void remove(s)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin],
  )

  return (
    <InstallGate moduleId="sites">
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS} active={filter} onChange={setFilter} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="md" disabled={!canWrite} onClick={() => setCreating(true)}>
            <Plus size={15} />
            新建站点
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索站点名或域名"
              spellCheck={false}
              className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            />
          </div>
          <IconButton
            aria-label="网站设置"
            icon={<Settings2 size={16} />}
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </div>

      {loadErr && sites.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
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
          rowKey={(s) => s.id}
          emptyText={
            <EmptyState
              icon={<Globe />}
              title={sites.length === 0 ? '还没有站点' : '没有匹配的站点'}
              hint={
                sites.length === 0
                  ? '点击「新建站点」开始托管你的域名。'
                  : '换个关键词或筛选条件试试。'
              }
            />
          }
        />
      )}

      {!canWrite && (
        <p className="text-xs text-muted">创建与变更需要 operator 角色,删除需要 admin。</p>
      )}

      {openSite && (
        <SiteDrawer
          site={openSite}
          canWrite={canWrite}
          isAdmin={isAdmin}
          initialTab={openTab}
          onClose={() => setOpenId(null)}
          onChanged={upsert}
        />
      )}
      {creating && (
        <CreateSiteModal
          onClose={() => setCreating(false)}
          onCreated={(site) => {
            upsert(site)
            setCreating(false)
            open(site)
          }}
        />
      )}
      {settingsOpen && <SettingsModal isAdmin={isAdmin} onClose={() => setSettingsOpen(false)} />}
    </div>
    </InstallGate>
  )
}
