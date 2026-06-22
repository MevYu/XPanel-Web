import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe, ShieldCheck, FolderInput, Clock, Database, type LucideIcon } from 'lucide-react'
import { apiFetch } from '../../api/client'
import { Card } from '../../components/Card'
import { useModules } from '../../hooks/useModules'

interface Source {
  /** 对应模块 id,只在该模块启用时才出卡。 */
  id: string
  label: string
  path: string
  icon: LucideIcon
  /** 拉取该模块列表并返回计数;失败由调用方兜底为 null。 */
  count: () => Promise<number>
}

const len = (x: unknown) => (Array.isArray(x) ? x.length : 0)

// 概览统计仅复用各模块既有只读列表端点,不新增后端;按 enabled 动态出卡,模块隔离不被破坏。
const SOURCES: Source[] = [
  { id: 'sites', label: '网站', path: '/sites', icon: Globe, count: () => apiFetch<unknown[]>('/api/m/sites/sites').then(len) },
  { id: 'ssl', label: '证书', path: '/ssl', icon: ShieldCheck, count: () => apiFetch<unknown[]>('/api/m/ssl/certs').then(len) },
  { id: 'ftp', label: 'FTP', path: '/ftp', icon: FolderInput, count: () => apiFetch<{ accounts: unknown[] }>('/api/m/ftp/accounts').then((d) => len(d.accounts)) },
  { id: 'database', label: '数据库', path: '/database', icon: Database, count: () => apiFetch<unknown[]>('/api/m/database/mysql/databases').then(len) },
  { id: 'cron', label: '定时任务', path: '/cron', icon: Clock, count: () => apiFetch<unknown[]>('/api/m/cron/jobs').then(len) },
]

/** OverviewStats 概览统计小卡:已启用模块的核心计数(站点/证书/FTP/任务),点击进对应模块。 */
export function OverviewStats() {
  const { enabled } = useModules()
  const [counts, setCounts] = useState<Record<string, number | null>>({})
  const active = SOURCES.filter((s) => enabled.some((m) => m.id === s.id))

  useEffect(() => {
    let alive = true
    for (const s of active) {
      s.count()
        .then((n) => alive && setCounts((c) => ({ ...c, [s.id]: n })))
        .catch(() => alive && setCounts((c) => ({ ...c, [s.id]: null })))
    }
    return () => {
      alive = false
    }
    // active 由 enabled 确定性派生,enabled 变更时重拉。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  if (active.length === 0) return null

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-text">概览</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {active.map((s) => {
          const Icon = s.icon
          const n = counts[s.id]
          return (
            <Link key={s.id} to={s.path} className="group outline-none">
              <div className="flex items-center gap-3 rounded-(--radius-card) border border-border/60 bg-surface-2/40 px-3 py-3 transition-colors group-hover:border-brand/40 group-hover:bg-surface-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-sm) bg-surface-2 text-muted transition-colors group-hover:text-brand">
                  <Icon size={18} />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="font-[family-name:var(--font-mono)] text-2xl font-medium leading-none tabular-nums text-text">
                    {n == null ? '—' : n}
                  </span>
                  <span className="mt-1 truncate text-xs text-muted">{s.label}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
