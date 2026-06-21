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
  // CPU iowait 百分比;旧后端可能不返回,缺失按 0 处理。
  cpu_iowait_percent?: number
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

export interface DiskPartition {
  device: string
  mountpoint: string
  fstype: string
  total: number
  used: number
  free: number
  used_percent: number
}

export interface ProcessInfo {
  pid: number
  name: string
  cpu_percent: number
  mem_percent: number
  rss: number
}

// ---- cron ----
export type CronJobType =
  | 'command'
  | 'shell'
  | 'release_mem'
  | 'log_cut'
  | 'url'
  | 'backup_site'
  | 'backup_db'

export type CronScheduleKind =
  | 'every_n_minutes'
  | 'hourly_at'
  | 'daily_at'
  | 'weekly_at'
  | 'monthly_at'
  | 'raw'

export interface CronSchedule {
  kind: CronScheduleKind
  minute?: number
  hour?: number
  day?: number
  weekday?: number
  expr?: string
}

export interface CronPayload {
  command?: string
  script?: string
  url?: string
  path?: string
  target?: string
  timeout?: number
}

export interface CronJob {
  id: number
  // 后端只持久化 cron 表达式;列表/详情返回 expr,不返回结构化 schedule。
  expr: string
  schedule?: CronSchedule
  type: CronJobType
  payload: CronPayload
  comment: string
  enabled: boolean
  created_by: number | null
  created_at: number
  updated_at: number
  last_run_at: number | null
  last_result: string
}

export interface CronRun {
  id: number
  job_id: number
  started_at: number
  duration_ms: number
  exit_code: number
  output: string
  err: string
}

// ---- files ----
export interface DirEntry {
  name: string
  is_dir: boolean
  size: number
  mode: string
  mod_time: number
  owner: string
  group: string
}

export interface TrashItem {
  id: string
  orig_path: string
  is_dir: boolean
  size: number
  deleted_at: number
}

export interface DirSize {
  bytes: number
  files: number
  dirs: number
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
