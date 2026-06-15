export interface Tokens { access: string; refresh: string }
export interface NavItem { label: string; icon: string; path: string }
export interface ModuleView {
  id: string; name: string; category: string
  requires: string[]; always_on: boolean
  enabled: boolean; nav: NavItem[]
}
export interface Metrics {
  cpu_percent: number
  mem_total: number; mem_used: number
  disk_total: number; disk_used: number
}
