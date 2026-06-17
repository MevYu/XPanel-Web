// 备份模块共享:类型、文案、格式化。后端契约以 internal/modules/backup 为准(全部 admin)。

export const DANGER = { 'X-Confirm-Danger': '1' }

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

export const TARGET_KINDS = [
  { value: 'path', label: '目录' },
  { value: 'mysql', label: 'MySQL 库' },
  { value: 'postgres', label: 'PostgreSQL 库' },
] as const
export type TargetKind = (typeof TARGET_KINDS)[number]['value']

export const kindLabel: { [k: string]: string } = {
  path: '目录',
  mysql: 'MySQL 库',
  postgres: 'PostgreSQL 库',
}

export interface Remote {
  id: number
  name: string
  type: string
  bucket: string
  endpoint: string
  region: string
  access_key: string
  secret_set: boolean
  created_at: number
}

export interface Job {
  id: number
  name: string
  target_kind: string
  target: string
  remote_id: number | null
  frequency: string
  keep: number
  created_at: number
}

export interface Record {
  id: number
  job_id: number | null
  target_kind: string
  target: string
  filename: string
  location: string // "local" | "remote"
  remote_id: number | null
  size: number
  created_at: number
}

export interface Settings {
  backup_dir: string
  mysqldump: string
  pgdump: string
}

export function fmtTime(unix: number | null): string {
  if (!unix) return '—'
  const d = new Date(unix * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function parseRemoteId(v: string): number | null {
  const n = Number(v)
  return v !== '' && Number.isInteger(n) ? n : null
}

// 裸 select / textarea 复用,与 sites 模块同串。
export const fieldClass =
  'h-10 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40'
