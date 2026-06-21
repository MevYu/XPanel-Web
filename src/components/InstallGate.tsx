import { useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink, PackageX } from 'lucide-react'
import { useModules } from '../hooks/useModules'
import { APP_DEPS, type InstallCmd } from '../lib/appDeps'
import { Button } from './Button'

/** CopyRow 单条安装命令:mono 代码块 + 复制按钮,复制后短暂显示已复制。 */
function CopyRow({ item }: { item: InstallCmd }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(item.cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{item.label}</span>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 overflow-x-auto rounded-(--radius-sm) border border-border bg-bg px-3 py-2 font-mono text-xs text-text">
          {item.cmd}
        </code>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          aria-label={copied ? '已复制' : '复制命令'}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
    </div>
  )
}

/** InstallGate 功能未安装统一遮罩:依赖软件未就绪时,变暗模糊 children 并覆盖安装提示卡片。 */
export function InstallGate({
  moduleId,
  children,
}: {
  moduleId: string
  children: ReactNode
}) {
  const { all, loading } = useModules()
  const mod = all.find((m) => m.id === moduleId)

  if (loading || !mod || !mod.health || mod.health.ok) {
    return <>{children}</>
  }

  const reason = mod.health.reason
  const dep = APP_DEPS[moduleId]

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none select-none opacity-40 blur-sm">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-(--radius-card) border border-border bg-surface p-6 text-center shadow-[var(--shadow-elevated),var(--inset-hl)]">
          <span className="text-faint" aria-hidden>
            <PackageX className="h-12 w-12 stroke-[1.2]" />
          </span>
          {dep ? (
            <>
              <span className="text-sm font-medium text-text">需要安装 {dep.app}</span>
              {reason && <span className="text-xs text-muted">{reason}</span>}
              <div className="flex w-full flex-col gap-3 text-left">
                {dep.installCmds.map((c) => (
                  <CopyRow key={c.label} item={c} />
                ))}
              </div>
              {dep.docUrl && (
                <a
                  href={dep.docUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  查看安装文档
                </a>
              )}
            </>
          ) : (
            <span className="max-w-sm text-sm text-muted">
              该功能依赖的服务尚未就绪:{reason || '未知原因'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
