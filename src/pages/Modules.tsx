import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useModules } from '../hooks/useModules'
import { Card } from '../components/Card'
import { Switch } from '../components/Switch'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { Table, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { Search, Inbox } from 'lucide-react'
import type { ModuleView } from '../api/types'

// 提取后端校验文案;HttpError.message 为响应体文本(后端已脱敏),取不到时给通用文案。
function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const ALL = '全部'

/** Modules 模块管理:工具栏(搜索 + 分类筛选)+ 紧凑表,逐行开关启用/停用。 */
export default function Modules() {
  const { all, loading, error, reload } = useModules()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL)
  // 逐行启停的进行中/失败态,按模块 id 索引。
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [rowErr, setRowErr] = useState<Record<string, string>>({})
  // 「展示到首页」有序 id 列表(home-apps 配置);开关切换即整列表回存。
  const [homeApps, setHomeApps] = useState<string[]>([])
  const [homeBusy, setHomeBusy] = useState<Record<string, boolean>>({})

  useEffect(() => {
    apiFetch<{ modules: string[] }>('/api/m/dashboard/home-apps')
      .then((res) => setHomeApps(res.modules ?? []))
      .catch(() => setHomeApps([]))
  }, [])

  async function toggleHome(m: ModuleView, next: boolean) {
    if (homeBusy[m.id]) return
    const updated = next
      ? [...homeApps.filter((id) => id !== m.id), m.id]
      : homeApps.filter((id) => id !== m.id)
    const prev = homeApps
    setHomeApps(updated)
    setHomeBusy((b) => ({ ...b, [m.id]: true }))
    try {
      await apiFetch('/api/m/dashboard/home-apps', {
        method: 'PUT',
        body: JSON.stringify({ modules: updated }),
      })
    } catch {
      setHomeApps(prev) // 回滚:保存失败不留下乐观态
    } finally {
      setHomeBusy((b) => ({ ...b, [m.id]: false }))
    }
  }

  const categories = useMemo(() => {
    const out: string[] = []
    for (const m of all) if (!out.includes(m.category)) out.push(m.category)
    return out
  }, [all])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((m) => {
      if (category !== ALL && m.category !== category) return false
      if (!q) return true
      return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    })
  }, [all, query, category])

  async function toggle(m: ModuleView, next: boolean) {
    if (busy[m.id] || m.always_on) return
    setBusy((b) => ({ ...b, [m.id]: true }))
    setRowErr((r) => {
      const next = { ...r }
      delete next[m.id]
      return next
    })
    try {
      await apiFetch(`/api/modules/${m.id}/${next ? 'enable' : 'disable'}`, { method: 'POST' })
      reload()
    } catch (e) {
      setRowErr((r) => ({ ...r, [m.id]: errorText(e) }))
    } finally {
      setBusy((b) => ({ ...b, [m.id]: false }))
    }
  }

  const columns: Column<ModuleView>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '模块名',
        cell: (m) => (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-text">{m.name}</span>
              {m.always_on && <Badge status="neutral">常驻</Badge>}
            </div>
            {(m.requires ?? []).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted">依赖</span>
                {(m.requires ?? []).map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-[family-name:var(--font-mono)] text-xs text-muted"
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
            {rowErr[m.id] && <span className="text-xs text-crit">{rowErr[m.id]}</span>}
          </div>
        ),
      },
      {
        key: 'category',
        header: '分类',
        width: '140px',
        cell: (m) => <span className="text-xs text-muted">{m.category}</span>,
      },
      {
        key: 'health',
        header: '健康',
        width: '180px',
        cell: (m) => {
          // 健康仅在异常时表态(警告 + 原因);正常/未知留空,避免与开关重复绿徽。
          if (!m.health || m.health.ok) return <span className="text-xs text-muted">—</span>
          return (
            <div className="flex min-w-0 flex-col gap-1">
              <Badge status="warn">依赖未就绪</Badge>
              {m.health.reason && (
                <span className="truncate text-xs text-warn">{m.health.reason}</span>
              )}
            </div>
          )
        },
      },
      {
        key: 'home',
        header: '展示到首页',
        width: '120px',
        align: 'right',
        cell: (m) =>
          // 仅已启用模块可上首页;非 admin 不显示开关。
          isAdmin && m.enabled ? (
            <Switch
              checked={homeApps.includes(m.id)}
              onChange={(next) => void toggleHome(m, next)}
              disabled={!!homeBusy[m.id]}
              aria-label={`${homeApps.includes(m.id) ? '从首页移除' : '展示到首页'} ${m.name}`}
            />
          ) : (
            <span className="text-xs text-muted">—</span>
          ),
      },
      {
        key: 'status',
        header: '状态',
        width: '120px',
        align: 'right',
        cell: (m) => (
          <span className="inline-flex items-center justify-end gap-2">
            {busy[m.id] && <Spinner size={14} />}
            <Switch
              checked={m.enabled}
              onChange={(next) => void toggle(m, next)}
              disabled={m.always_on || !!busy[m.id]}
              aria-label={`${m.enabled ? '停用' : '启用'} ${m.name}`}
            />
          </span>
        ),
      },
    ],
    // toggle/状态闭包依赖 busy/rowErr/homeApps/homeBusy/isAdmin,随之刷新。
    [busy, rowErr, homeApps, homeBusy, isAdmin],
  )

  if (loading && all.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  if (error && all.length === 0) {
    return (
      <Card className="text-sm text-muted">
        无法获取模块列表,请确认后端服务在运行,稍后重试。
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={category === ALL} onClick={() => setCategory(ALL)}>
            {ALL}
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </FilterChip>
          ))}
        </div>
        <div className="relative w-56">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索模块名或 ID"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
      </div>

      <Table
        columns={columns}
        rows={visible}
        rowKey={(m) => m.id}
        emptyText={
          <EmptyState
            icon={<Inbox />}
            title="没有匹配的模块"
            hint="换个关键词或切换分类试试。"
          />
        }
      />
    </div>
  )
}

/** FilterChip 分类筛选小药丸:选中走品牌强调,未选中中性。 */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-(--radius-sm) border px-3 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 ${
        active
          ? 'border-brand/40 bg-brand/10 text-brand'
          : 'border-border bg-surface-2 text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}
