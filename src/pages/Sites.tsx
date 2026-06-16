import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Plus, Settings2, Search, Globe2 } from 'lucide-react'
import { type Site, DANGER, errorText } from './sites/shared'
import { SiteCard } from './sites/SiteCard'
import { SiteDrawer } from './sites/SiteDrawer'
import { CreateSiteModal } from './sites/CreateSiteModal'
import { SettingsModal } from './sites/SettingsModal'

type Filter = 'all' | 'static' | 'php' | 'proxy'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'static', label: '静态' },
  { key: 'php', label: 'PHP' },
  { key: 'proxy', label: '反向代理' },
]

/** Sites 网站管理:站点列表 + 新建弹窗 + tab 化详情抽屉(概览/域名/配置文件)+ 建站设置。 */
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

  async function toggle(site: Site, enable: boolean) {
    if (!canWrite) return
    if (!enable && !window.confirm(`确认停用站点「${site.name}」?这将下线该站点。`)) return
    try {
      const updated = await apiFetch<Site>(
        `/api/m/sites/sites/${site.id}/${enable ? 'enable' : 'disable'}`,
        { method: 'POST', headers: enable ? undefined : DANGER },
      )
      upsert(updated)
    } catch (e) {
      setLoadErr(errorText(e))
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

  const openSite = openId == null ? null : (sites.find((s) => s.id === openId) ?? null)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
            网站
          </h1>
          <p className="text-xs text-muted">
            {sites.length > 0 ? `共 ${sites.length} 个站点` : '管理 nginx vhost,支持静态 / PHP / 反向代理'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="md" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} />
            设置
          </Button>
          <Button size="md" disabled={!canWrite} onClick={() => setCreating(true)}>
            <Plus size={15} />
            新建站点
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索站点名或域名"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-card) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
        <div className="flex gap-1 rounded-(--radius-card) border border-border bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`h-8 rounded-(--radius-card) px-3 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                filter === f.key ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[76px] animate-pulse rounded-(--radius-card) border border-border bg-surface"
            />
          ))}
        </div>
      ) : loadErr && sites.length === 0 ? (
        <EmptyState
          title="加载失败"
          desc={loadErr}
          action={
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              重试
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={sites.length === 0 ? '还没有站点' : '没有匹配的站点'}
          desc={
            sites.length === 0
              ? '新建一个站点开始托管你的域名。'
              : '换个关键词或筛选条件试试。'
          }
          action={
            sites.length === 0 && canWrite ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus size={14} />
                新建站点
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              canWrite={canWrite}
              isAdmin={isAdmin}
              onOpen={() => setOpenId(site.id)}
              onToggle={(enable) => void toggle(site, enable)}
              onDelete={() => void remove(site)}
            />
          ))}
        </div>
      )}

      {!canWrite && (
        <p className="text-xs text-muted">创建与变更需要 operator 角色,删除需要 admin。</p>
      )}

      {openSite && (
        <SiteDrawer
          site={openSite}
          canWrite={canWrite}
          isAdmin={isAdmin}
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
            setOpenId(site.id)
          }}
        />
      )}
      {settingsOpen && <SettingsModal isAdmin={isAdmin} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function EmptyState({
  title,
  desc,
  action,
}: {
  title: string
  desc: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-(--radius-card) border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Globe2 size={22} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="max-w-xs text-xs text-muted">{desc}</p>
      </div>
      {action}
    </div>
  )
}
