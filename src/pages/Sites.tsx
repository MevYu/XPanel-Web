import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Tabs } from '../components/Tabs'
import { IconButton } from '../components/IconButton'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Badge } from '../components/Badge'
import { Table, ActionLink, type Column } from '../components/Table'
import {
  Plus,
  Settings2,
  Search,
  Globe,
  Code2,
  Boxes,
  Play,
  Pause,
  ShieldCheck,
  FileCode2,
  MoreVertical,
  Trash2,
  Archive,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { InstallGate } from '../components/InstallGate'
import { type Site, DANGER, errorText, kindLabel, formatTime } from './sites/shared'
import { SiteDrawer } from './sites/SiteDrawer'
import { CreateSiteModal } from './sites/CreateSiteModal'
import { SettingsModal } from './sites/SettingsModal'

type Filter = 'all' | 'php' | 'static' | 'proxy'

// SiteDrawer 可深链的 tab 子集,供列表行操作直达对应设置页。
type DrawerTab = 'overview' | 'backups' | 'ssl' | 'logs' | 'config'

const PAGE_SIZES = [10, 20, 50] as const

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
  const [openTab, setOpenTab] = useState<DrawerTab>('overview')
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [menuId, setMenuId] = useState<number | null>(null)

  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

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

  function open(site: Site, tab: DrawerTab = 'overview') {
    setOpenTab(tab)
    setOpenId(site.id)
  }

  // toggle 直接切站点运行状态,接 sites 模块 enable/disable 端点(disable 危险操作需确认 + DANGER 头)。
  async function toggle(site: Site) {
    if (!canWrite || togglingId != null) return
    const enable = !site.enabled
    if (!enable && !window.confirm(`确认停用站点「${site.name}」?这将下线该站点。`)) return
    setTogglingId(site.id)
    try {
      const updated = await apiFetch<Site>(
        `/api/m/sites/sites/${site.id}/${enable ? 'enable' : 'disable'}`,
        { method: 'POST', headers: enable ? undefined : DANGER },
      )
      upsert(updated)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setTogglingId(null)
    }
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

  // 筛选/搜索/每页条数变化或行数缩减时,把当前页夹回有效范围,避免停在空页。
  const total = visible.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  const pageRows = useMemo(
    () => visible.slice(page * pageSize, page * pageSize + pageSize),
    [visible, page, pageSize],
  )

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
        width: '64px',
        align: 'center',
        cell: (s) => {
          const busy = togglingId === s.id
          return (
            <button
              type="button"
              disabled={!canWrite || busy}
              aria-label={s.enabled ? '停用站点' : '启用站点'}
              title={canWrite ? (s.enabled ? '运行中,点击停用' : '已停用,点击启用') : '需要 operator 角色'}
              onClick={() => void toggle(s)}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-50 ${
                s.enabled
                  ? 'text-online hover:bg-online-soft'
                  : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              {busy ? (
                <Spinner size={14} />
              ) : s.enabled ? (
                <Play size={15} className="fill-current" />
              ) : (
                <Pause size={15} className="fill-current" />
              )}
            </button>
          )
        },
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
        cell: (s) => <ActionLink onClick={() => open(s, 'backups')}>备份</ActionLink>,
      },
      {
        key: 'quick',
        header: '快捷',
        width: '88px',
        cell: (s) => (
          <div className="flex items-center gap-0.5">
            <IconButton
              aria-label="配置文件"
              title="配置文件"
              className="h-7 w-7"
              icon={<FileCode2 size={15} />}
              onClick={() => open(s, 'config')}
            />
            <IconButton
              aria-label="SSL 证书"
              title="SSL 证书"
              className="h-7 w-7"
              icon={<ShieldCheck size={15} />}
              onClick={() => open(s, 'ssl')}
            />
          </div>
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
        width: '132px',
        align: 'right',
        cell: (s) => (
          <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
            <ActionLink onClick={() => open(s, 'config')}>配置</ActionLink>
            <span className="text-border">|</span>
            <ActionLink onClick={() => open(s, 'logs')}>日志</ActionLink>
            <span className="text-border">|</span>
            <RowMenu
              open={menuId === s.id}
              onToggle={() => setMenuId((id) => (id === s.id ? null : s.id))}
              onClose={() => setMenuId(null)}
            >
              <MenuItem onClick={() => open(s)}>
                <Settings2 size={14} /> 设置
              </MenuItem>
              <MenuItem onClick={() => open(s, 'backups')}>
                <Archive size={14} /> 备份
              </MenuItem>
              <MenuItem
                danger
                disabled={!isAdmin}
                title={isAdmin ? '删除站点' : '需要 admin 角色'}
                onClick={() => void remove(s)}
              >
                <Trash2 size={14} /> 删除
              </MenuItem>
            </RowMenu>
          </span>
        ),
      },
    ],
    [isAdmin, canWrite, togglingId, menuId],
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
        <>
          <Table
            columns={columns}
            rows={pageRows}
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
          {total > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
              <span className="tabular-nums">共 {total} 条</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(0)
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
                  disabled={page === 0}
                  icon={<ChevronLeft size={16} />}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                />
                <span className="tabular-nums px-1">
                  {page + 1} / {pageCount}
                </span>
                <IconButton
                  aria-label="下一页"
                  className="h-8 w-8"
                  disabled={page >= pageCount - 1}
                  icon={<ChevronRight size={16} />}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                />
              </div>
            </div>
          )}
        </>
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

/**
 * RowMenu 行内「更多」下拉:⋮ 触发,菜单用 fixed 定位脱离表格 overflow 裁剪;
 * 点击外部或 Escape 关闭。受控 open,父层用 menuId 保证同时只开一个。
 */
function RowMenu({
  open,
  onToggle,
  onClose,
  children,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  function handleToggle(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    onToggle()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <span ref={wrapRef} className="inline-flex">
      <IconButton
        aria-label="更多操作"
        title="更多操作"
        className="h-7 w-7"
        icon={<MoreVertical size={16} />}
        onClick={handleToggle}
      />
      {open && pos && (
        <div
          role="menu"
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 min-w-32 overflow-hidden rounded-(--radius-sm) border border-border bg-surface py-1 shadow-lg"
          onClick={onClose}
        >
          {children}
        </div>
      )}
    </span>
  )
}

/** MenuItem RowMenu 内的一行操作项:图标 + 文案,danger 走危险色,disabled 不可点。 */
function MenuItem({
  onClick,
  children,
  danger,
  disabled,
  title,
}: {
  onClick: () => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] outline-none transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-muted hover:bg-crit-soft hover:text-crit' : 'text-text hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}
