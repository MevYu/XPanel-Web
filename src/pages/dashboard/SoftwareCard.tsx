import { useNavigate } from 'react-router-dom'
import { useModules } from '../../hooks/useModules'
import { iconFor, colorFor } from '../../layout/icons'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { LayoutGrid } from 'lucide-react'
import type { ModuleView, NavItem } from '../../api/types'

// 纯系统/面板页,不算"已安装软件",不进宫格。
const SYSTEM_IDS = new Set(['dashboard', 'modules', 'terminal'])

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

/** SoftwareCard 软件卡:已启用模块即"已安装软件",图标宫格入口,点击进模块管理页(对标 aaPanel Software 区)。 */
export function SoftwareCard() {
  const { enabled } = useModules()
  const navigate = useNavigate()
  const apps = enabled.filter((m) => !SYSTEM_IDS.has(m.id)).map(toApp)

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-text">软件</h3>
      {apps.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid />}
          title="暂无已启用软件"
          hint="在「模块管理」开启所需软件后,这里会出现快捷入口。"
        />
      ) : (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
          {apps.map((app) => (
            <AppTile key={app.id} app={app} onClick={() => navigate(app.path)} />
          ))}
        </div>
      )}
    </Card>
  )
}

function AppTile({ app, onClick }: { app: App; onClick: () => void }) {
  const Icon = iconFor(app.icon)
  return (
    <button
      type="button"
      onClick={onClick}
      title={app.name}
      className="row-hover flex flex-col items-center gap-1.5 rounded-(--radius-sm) px-1 py-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
    >
      <Icon size={26} className={`shrink-0 ${colorFor(app.icon)}`} />
      <span className="w-full truncate text-xs text-muted">{app.name}</span>
    </button>
  )
}
