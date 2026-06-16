export interface Tokens { access: string; refresh: string }
export interface NavItem { label: string; icon: string; path: string }
export interface ModuleView {
  id: string; name: string; category: string
  requires: string[]; always_on: boolean
  enabled: boolean; nav: NavItem[]
  // 后端依赖探测结果;ok=false 时 reason 说明缺哪个依赖。旧后端可能不返回。
  health?: { ok: boolean; reason: string }
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

// ---- cron ----
export interface CronJob {
  id: number
  expr: string
  command: string
  comment: string
  enabled: boolean
  created_by: number | null
  created_at: number
  updated_at: number
  last_run_at: number | null
  last_result: string
}

// ---- files ----
export interface DirEntry {
  name: string
  is_dir: boolean
  size: number
  mode: string
  mod_time: number
}

export interface Share {
  token: string
  path: string
  has_password: boolean
  allow_list: boolean
  expires_at: number
  max_downloads: number
  downloads: number
  created_at: number
}
