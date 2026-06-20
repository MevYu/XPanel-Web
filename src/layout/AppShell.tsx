import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { IconButton } from '../components/IconButton'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 路由变化时自动关闭移动端抽屉。
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  return (
    <div className="grid h-dvh overflow-hidden lg:grid-cols-[auto_1fr]">
      {/* 大屏常驻侧栏:固定列,菜单多时只在侧栏内部滚 */}
      <div className="hidden min-h-0 lg:block">
        <Sidebar />
      </div>

      {/* 小屏抽屉:遮罩 + 左侧滑入 */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-40 shadow-[var(--shadow-elevated)] transition-transform duration-(--dur-base) ease-(--ease-out) lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      <div className="flex min-h-0 min-w-0 flex-col">
        {/* 顶栏已移除:小屏保留浮动汉堡作为抽屉入口,大屏隐藏 */}
        <IconButton
          icon={<Menu size={18} />}
          aria-label="打开菜单"
          className="fixed left-4 top-4 z-20 bg-surface/80 shadow-[var(--shadow-elevated)] backdrop-blur-md lg:hidden"
          onClick={() => setDrawerOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 pt-16 lg:pt-4">
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
