import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useModules } from '../hooks/useModules'
import { IconButton } from '../components/IconButton'
import { Logo } from '../components/Logo'
import { TelemetryRail } from './TelemetryRail'
import { AccentControl } from './AccentControl'
import { iconFor } from './icons'
import type { NavItem } from '../api/types'

interface Group {
  category: string
  items: NavItem[]
}

// 已启用模块的 nav 项按 category 分组,保留模块出现顺序。
function groupNav(groups: { category: string; nav: NavItem[] }[]): Group[] {
  const out: Group[] = []
  const index = new Map<string, Group>()
  for (const m of groups) {
    if ((m.nav ?? []).length === 0) continue
    let g = index.get(m.category)
    if (!g) {
      g = { category: m.category, items: [] }
      index.set(m.category, g)
      out.push(g)
    }
    g.items.push(...(m.nav ?? []))
  }
  return out
}

export function Sidebar() {
  const { role, logout } = useAuth()
  const { enabled } = useModules()
  const [collapsed, setCollapsed] = useState(false)
  const groups = groupNav(enabled)

  return (
    <nav
      className={`flex h-full flex-col border-r border-border bg-gradient-to-b from-surface to-bg transition-[width] duration-(--dur-base) ease-(--ease-out) ${
        collapsed ? 'w-[68px]' : 'w-[238px]'
      }`}
    >
      <div className={`flex h-14 items-center border-b border-border/60 px-3 ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
        <Logo size={26} className="shrink-0" />
        {!collapsed && (
          <span className="bg-gradient-to-r from-text to-brand-bright bg-clip-text font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-transparent">
            XPanel
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {groups.map((g) => (
          <div key={g.category} className="mb-4">
            {!collapsed && (
              <p className="px-1.5 pb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-faint">
                {g.category}
              </p>
            )}
            {g.items.map((item) => (
              <NavRow key={item.path} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}

        <div className="mb-4">
          {!collapsed && (
            <p className="px-1.5 pb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-faint">管理</p>
          )}
          <NavRow item={{ label: '域名', icon: 'globe', path: '/domains' }} collapsed={collapsed} />
          <NavRow
            item={{ label: '模块管理', icon: 'boxes', path: '/modules' }}
            collapsed={collapsed}
          />
          {role === 'admin' && (
            <>
              <NavRow item={{ label: '日志', icon: 'scroll-text', path: '/logs' }} collapsed={collapsed} />
              <NavRow
                item={{ label: '设置', icon: 'settings', path: '/settings' }}
                collapsed={collapsed}
              />
            </>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="border-t border-border/60 p-1.5">
          <TelemetryRail />
        </div>
      )}

      <div className="border-t border-border/60 p-1.5">
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between px-1.5">
            <span className="text-xs text-faint">主题色</span>
            <AccentControl />
          </div>
        )}
        <div
          className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between'}`}
        >
          {!collapsed && (
            <span className="px-1.5 text-xs text-faint">
              角色 · <span className="text-text">{role || '未知'}</span>
            </span>
          )}
          <IconButton
            icon={<LogOut size={18} />}
            aria-label="退出登录"
            onClick={() => void logout()}
          />
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-1 flex w-full items-center gap-2 rounded-(--radius-sm) px-1.5 py-1.5 text-xs text-muted transition-[background-color,color] duration-(--dur-micro) ease-(--ease-out) outline-none hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span>收起侧栏</span>}
        </button>
      </div>
    </nav>
  )
}

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = iconFor(item.icon)
  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        // 对标设计稿:单色描边图标随状态变色,活动项=光泽渐变底 + 发光左条 + 图标品牌辉光(见 global.css .nav-active)。
        `relative flex h-[42px] items-center gap-3 rounded-xl border border-transparent px-3 text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-(--dur-micro) ease-(--ease-out) outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
          isActive
            ? 'nav-active text-text [&_svg]:text-brand'
            : 'text-muted hover:bg-surface-2 hover:text-text'
        } ${collapsed ? 'justify-center gap-0 px-0' : ''}`
      }
    >
      <Icon size={19} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  )
}
