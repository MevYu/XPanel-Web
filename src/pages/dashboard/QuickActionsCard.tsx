import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Globe,
  Database,
  FolderOpen,
  SquareTerminal,
  ShieldCheck,
  Clock,
  Boxes,
  Container,
} from 'lucide-react'
import { apiFetch } from '../../api/client'
import { Card } from '../../components/Card'

const ACTIONS = [
  { label: '建站', Icon: Globe, path: '/sites' },
  { label: '建库', Icon: Database, path: '/database' },
  { label: '文件', Icon: FolderOpen, path: '/files' },
  { label: '终端', Icon: SquareTerminal, path: '/terminal' },
  { label: '安全', Icon: ShieldCheck, path: '/firewall' },
  { label: '计划任务', Icon: Clock, path: '/cron' },
  { label: '应用', Icon: Boxes, path: '/appstore' },
  { label: '容器', Icon: Container, path: '/docker' },
]

// 关注的常驻服务(命中即展示),取前若干条。
const WATCH = ['nginx', 'mysql', 'mysqld', 'mariadb', 'redis', 'redis-server', 'docker', 'php-fpm']

interface Service {
  name: string
  active: string
}

/** QuickActionsCard 快捷操作卡:模块入口宫格 + 关键服务状态/重启(对标设计稿 Quick Actions + Services)。 */
export function QuickActionsCard() {
  const nav = useNavigate()
  const [services, setServices] = useState<Service[]>([])
  const [busy, setBusy] = useState('')

  function load() {
    apiFetch<Service[]>('/api/m/service/services')
      .then((all) =>
        setServices(all.filter((s) => WATCH.some((w) => s.name === w || s.name.startsWith(w + '@'))).slice(0, 6)),
      )
      .catch(() => setServices([]))
  }
  useEffect(load, [])

  async function restart(name: string) {
    if (busy) return
    setBusy(name)
    try {
      await apiFetch(`/api/m/service/restart?unit=${encodeURIComponent(name)}`, { method: 'POST' })
      load()
    } catch {
      /* 静默:状态会在下次拉取反映 */
    } finally {
      setBusy('')
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-text">快捷操作</h3>
      <div className="grid grid-cols-4 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.path}
            onClick={() => nav(a.path)}
            className="flex flex-col items-center gap-1.5 rounded-(--radius-sm) border border-border bg-surface-2/50 py-3 text-xs text-muted outline-none transition hover:border-brand/40 hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <a.Icon size={18} />
            {a.label}
          </button>
        ))}
      </div>
      {services.length > 0 && (
        <>
          <div className="h-px bg-border" />
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted">服务状态</span>
            {services.map((s) => {
              const on = s.active === 'running'
              return (
                <div key={s.name} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${on ? 'bg-online' : 'bg-crit'}`}
                    aria-hidden
                  />
                  <span className="flex-1 truncate font-[family-name:var(--font-mono)] text-text">{s.name}</span>
                  <span className="text-xs text-faint">{s.active}</span>
                  <button
                    onClick={() => void restart(s.name)}
                    disabled={busy === s.name}
                    className="text-xs text-brand outline-none hover:underline disabled:opacity-50"
                  >
                    重启
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
