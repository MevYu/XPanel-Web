import {
  Activity,
  Boxes,
  Cpu,
  Gauge,
  HardDrive,
  LayoutDashboard,
  Network,
  Server,
  ServerCog,
  Settings,
  Shield,
  Terminal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// 后端 nav.icon 字段名(kebab-case)→ lucide 组件;未命中给兜底图标。
const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  dashboard: LayoutDashboard,
  'layout-dashboard': LayoutDashboard,
  server: Server,
  'server-cog': ServerCog,
  cpu: Cpu,
  'hard-drive': HardDrive,
  network: Network,
  activity: Activity,
  shield: Shield,
  terminal: Terminal,
  settings: Settings,
  boxes: Boxes,
}

/** iconFor 把后端 icon 字段名解析为 lucide 组件,缺省返回 Boxes。 */
export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Boxes
}
