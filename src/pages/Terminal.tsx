import { lazy, Suspense } from 'react'
import { Spinner } from '../components/Spinner'

// xterm 及其 CSS 体积较大,懒加载避免进首屏主包。
const TerminalView = lazy(() => import('./TerminalView'))

/** Terminal Web 终端页:懒加载真正的 xterm 视图。 */
export default function Terminal() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Spinner size={24} />
        </div>
      }
    >
      <TerminalView />
    </Suspense>
  )
}
