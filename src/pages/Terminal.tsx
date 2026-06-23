import { lazy, Suspense } from 'react'
import { TerminalSquare } from 'lucide-react'
import { Spinner } from '../components/Spinner'

// xterm 及其 CSS 体积较大,懒加载避免进首屏主包。
const TerminalView = lazy(() => import('./TerminalView'))

/** Terminal Web 终端页:页头 + 懒加载 xterm 视图,终端主体撑满剩余高度。 */
export default function Terminal() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-semibold text-text">
          <TerminalSquare size={18} className="text-brand" aria-hidden />
          Web 终端
        </h1>
        <span className="text-xs text-muted">直连主机 shell,与本地终端等价。</span>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center rounded-(--radius-card) border border-border bg-surface">
            <Spinner size={24} />
          </div>
        }
      >
        <TerminalView />
      </Suspense>
    </div>
  )
}
