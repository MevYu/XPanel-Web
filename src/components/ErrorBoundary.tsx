import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Card } from './Card'
import { Button } from './Button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** ErrorBoundary 捕获子树渲染错误,展示居中兜底卡片,避免单页出错白屏全站。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面渲染出错', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full min-h-64 items-center justify-center p-6">
        <Card className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
              页面出错了
            </h2>
            <p className="text-sm text-muted">
              此页面遇到意外错误,刷新通常即可恢复。如反复出现,请联系管理员。
            </p>
          </div>
          <Button onClick={() => window.location.reload()}>重试</Button>
        </Card>
      </div>
    )
  }
}
