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

/** QuickActionsCard 快捷操作卡:模块入口宫格(对标设计稿 Quick Actions)。 */
export function QuickActionsCard() {
  const nav = useNavigate()
  return (
    <Card className="flex flex-col gap-3">
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
    </Card>
  )
}
