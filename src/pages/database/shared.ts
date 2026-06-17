// 数据库模块共享:类型、文案、工具。后端契约以 internal/modules/database 为准。
import { tokenStore } from '../../api/client'
import { formatTimeISO } from '../../lib/formatTime'

export const DANGER = { 'X-Confirm-Danger': '1' }

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

export type Engine = 'mysql' | 'postgres'

export interface DbInfo {
  name: string
  size_mb: string
  tables: number
  charset: string
  collation: string
}

export interface DbUser {
  user: string
  host: string
}

export interface Backup {
  id: string
  engine: string
  db_name: string
  filename: string
  size: number
  created_at: string
}

export interface Settings {
  mysql_host: string
  mysql_port: number
  mysql_socket: string
  mysql_user: string
  mysql_password: string
  mysql_data_dir: string
  pg_host: string
  pg_port: number
  pg_user: string
  pg_password: string
  pg_data_dir: string
  redis_host: string
  redis_port: number
  redis_password: string
  backup_dir: string
}

export interface SettingsResponse {
  settings: Settings
  passwords_set: string[]
}

export const ENGINE_LABEL: Record<Engine, string> = {
  mysql: 'MySQL / MariaDB',
  postgres: 'PostgreSQL',
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`
}

export function formatDate(iso: string): string {
  return formatTimeISO(iso)
}

// redis info 是 text/plain:apiFetch 强制 JSON.parse 会抛错,故走裸 fetch。
export async function fetchText(path: string): Promise<string> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

// 下载走裸 fetch 取 blob:apiFetch 会强制 JSON.parse,二进制响应会抛错。
export async function downloadBlob(path: string, filename: string): Promise<void> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// 导入走裸 fetch 上传原始体(?gzip=1 表示体为 gzip):后端流式读取,危险需 DANGER 头。
export async function importSql(
  engine: Engine,
  database: string,
  body: File,
  gzip: boolean,
): Promise<void> {
  const t = tokenStore.get()
  const headers: Record<string, string> = { 'X-Confirm-Danger': '1' }
  if (t) headers.Authorization = `Bearer ${t.access}`
  const q = `?database=${encodeURIComponent(database)}${gzip ? '&gzip=1' : ''}`
  const res = await fetch(`/api/m/database/${engine}/import${q}`, {
    method: 'POST',
    headers,
    body,
  })
  if (!res.ok) throw new Error((await res.text()) || '导入失败')
}
