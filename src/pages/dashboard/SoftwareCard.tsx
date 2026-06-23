import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { useModules } from '../../hooks/useModules'
import { iconFor, colorFor } from '../../layout/icons'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { LayoutGrid } from 'lucide-react'
import type { ModuleView, NavItem } from '../../api/types'

interface HomeApps {
  modules: string[]
}

interface App {
  id: string
  name: string
  icon: string
  path: string
}

// toApp 用模块首个 nav 项(图标 + 跳转路径)代表该软件;无 nav 时回落到 /{id}。
function toApp(m: ModuleView): App {
  const nav: NavItem | undefined = m.nav?.[0]
  return {
    id: m.id,
    name: m.name,
    icon: nav?.icon ?? m.id,
    path: nav?.path ?? `/${m.id}`,
  }
}

/**
 * SoftwareCard 软件卡:读 home-apps 有序配置渲染图标宫格(对标 aaPanel Software 区),
 * HTML5 原生拖拽重排,松手后整列表 PUT 回存。
 */
export function SoftwareCard() {
  const { all } = useModules()
  const navigate = useNavigate()
  const [order, setOrder] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<HomeApps>('/api/m/dashboard/home-apps')
      .then((res) => setOrder(res.modules ?? []))
      .catch(() => setOrder([]))
  }, [])

  // 按 order 解析出可渲染的模块;配置里指向已卸载/未知模块的 id 自动跳过。
  const apps = useMemo(() => {
    const byId = new Map(all.map((m) => [m.id, m]))
    return order.flatMap((id) => {
      const m = byId.get(id)
      return m ? [toApp(m)] : []
    })
  }, [all, order])

  function persist(next: string[]) {
    void apiFetch('/api/m/dashboard/home-apps', {
      method: 'PUT',
      body: JSON.stringify({ modules: next }),
    }).catch(() => {})
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return
    const next = [...order]
    const from = next.indexOf(dragId)
    const to = next.indexOf(targetId)
    if (from === -1 || to === -1) return
    next.splice(to, 0, next.splice(from, 1)[0])
    setOrder(next)
    setDragId(null)
    persist(next)
  }

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-text">软件</h3>
      {apps.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid />}
          title="暂无首页软件"
          hint="去「模块管理」把软件添加到首页,这里会出现快捷入口。"
        />
      ) : (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
          {apps.map((app) => (
            <AppTile
              key={app.id}
              app={app}
              dragging={dragId === app.id}
              onClick={() => navigate(app.path)}
              onDragStart={() => setDragId(app.id)}
              onDragEnd={() => setDragId(null)}
              onDrop={() => onDrop(app.id)}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

function AppTile({
  app,
  dragging,
  onClick,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  app: App
  dragging: boolean
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: () => void
}) {
  const Icon = iconFor(app.icon)
  return (
    <button
      type="button"
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      title={app.name}
      className={`row-hover flex cursor-grab flex-col items-center gap-1.5 rounded-(--radius-sm) px-1 py-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      <Icon size={26} className={`shrink-0 ${colorFor(app.icon)}`} />
      <span className="w-full truncate text-xs text-muted">{app.name}</span>
    </button>
  )
}
