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

export interface DetailMetrics {
  cpu_per_core: number[]
  load: { load1: number; load5: number; load15: number }
  memory: {
    total: number; used: number; available: number; free: number
    cached: number; buffers: number
    swap_total: number; swap_used: number; swap_free: number
  }
  // network/disk_io 字段为累计计数,速率需前端相邻采样差分。
  network: {
    name: string
    bytes_recv: number; bytes_sent: number
    packets_recv: number; packets_sent: number
  }[]
  disk_io: {
    name: string
    read_bytes: number; write_bytes: number
    read_count: number; write_count: number
  }[]
  uptime_sec: number
  boot_time: number
}

export interface ProcessInfo {
  pid: number
  name: string
  cpu_percent: number
  mem_percent: number
  rss: number
}
