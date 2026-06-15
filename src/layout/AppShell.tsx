import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useModules } from '../hooks/useModules'
import { IconButton } from '../components/IconButton'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Sidebar } from './Sidebar'
import { TelemetryRail } from './TelemetryRail'
import type { NavItem } from '../api/types'

// 已知静态路由 → 标题兜底,模块 nav 未命中时使用。
const STATIC_TITLES: Record<string, string> = {
  '/dashboard': '系统总览',
  '/modules': '模块管理',
  '/service': '服务管理',
}

// 由当前路由反查页面标题:优先匹配模块 nav,再退回已知静态路由,最后给通用名。
export function resolveTitle(
  pathname: string,
  enabled: { nav: NavItem[] }[],
): string {
  for (const m of enabled) {
    const hit = (m.nav ?? []).find((n) => n.path === pathname)
    if (hit) return hit.label
  }
  return STATIC_TITLES[pathname] ?? '控制台'
}

function usePageTitle(): string {
  const { pathname } = useLocation()
  const { enabled } = useModules()
  return resolveTitle(pathname, enabled)
}

export function AppShell() {
  const title = usePageTitle()
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 路由变化时自动关闭移动端抽屉。
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  return (
    <div className="grid h-full lg:grid-cols-[auto_1fr]">
      {/* 大屏常驻侧栏 */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* 小屏抽屉:遮罩 + 左侧滑入 */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border px-4 sm:px-6">
          <IconButton
            icon={<Menu size={18} />}
            aria-label="打开菜单"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
          />
          <h1 className="min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-text">
            {title}
          </h1>
          <TelemetryRail />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
