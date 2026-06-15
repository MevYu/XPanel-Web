import { Outlet, useLocation } from 'react-router-dom'
import { useModules } from '../hooks/useModules'
import { Sidebar } from './Sidebar'
import { TelemetryRail } from './TelemetryRail'

// 由当前路由反查页面标题:优先匹配模块 nav,再退回固定入口,最后给通用名。
function usePageTitle(): string {
  const { pathname } = useLocation()
  const { enabled } = useModules()
  for (const m of enabled) {
    const hit = m.nav.find((n) => n.path === pathname)
    if (hit) return hit.label
  }
  if (pathname.startsWith('/modules')) return '模块管理'
  return '控制台'
}

export function AppShell() {
  const title = usePageTitle()
  return (
    <div className="grid h-full grid-cols-[auto_1fr]">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-6">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-text">
            {title}
          </h1>
          <TelemetryRail />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
