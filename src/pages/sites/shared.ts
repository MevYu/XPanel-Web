// 网站模块共享:类型、文案、样式 token 串。后端契约以 internal/modules/sites 为准。

export const DANGER = { 'X-Confirm-Danger': '1' }

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

export interface Site {
  id: number
  name: string
  domains: string[]
  kind: string
  listen: number
  enabled: boolean
  config: string
  created_by: number | null
  created_at: number
  updated_at: number
}

export interface SiteSettings {
  web_root: string
  conf_dir: string
  log_dir: string
  php_socket: string
}

export type Kind = 'static' | 'proxy' | 'php'

export const kindLabel: Record<string, string> = {
  static: '静态',
  proxy: '反向代理',
  php: 'PHP',
}

// 类型 → 语义色 token 名,用于卡片左色条与图标底色。
export const kindAccent: Record<string, string> = {
  static: 'var(--color-brand)',
  proxy: 'var(--color-warn)',
  php: 'var(--color-online)',
}

export function formatTime(unixSec: number): string {
  if (!unixSec) return '—'
  const d = new Date(unixSec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

