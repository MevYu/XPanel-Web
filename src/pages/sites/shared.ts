// 网站模块共享:类型、文案、样式 token 串。后端契约以 internal/modules/sites 为准。
import { tokenStore } from '../../api/client'

export const DANGER = { 'X-Confirm-Danger': '1' }

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

export type Kind = 'static' | 'proxy' | 'php'

export interface DomainBinding {
  domain: string
  port: number
}

export interface SSL {
  ssl_enabled: boolean
  cert_path: string
  key_path: string
  force_https: boolean
  hsts: boolean
  expires_at: number // 证书到期 Unix 秒,0 = 无证书
  auto_renew: boolean // Let's Encrypt 自动续期是否已开启
}

export interface Backup {
  id: number
  site_id: number
  filename: string
  size: number
  created_at: number
  created_by: number | null
}

export interface ProxyConfig {
  proxy_target: string
  upstreams: string[]
  cache: boolean
  cache_time: number
  set_headers: { name: string; value: string }[]
  websocket: boolean
  send_host: string
}

export interface Limits {
  rate_kb: number
  conn: number
}

export interface ErrorPage {
  code: number
  path: string
}

export interface DirProtectView {
  path: string
  username: string
}

export interface Redirect {
  from: string
  to: string
  code: number
}

export interface AntiLeech {
  enabled: boolean
  extensions: string[]
  allowed_referers: string[]
}

export interface Site {
  id: number
  name: string
  domains: string[]
  domain_bindings: DomainBinding[]
  kind: Kind
  listen: number
  root_dir: string
  php_version: string
  index_docs: string[]
  enabled: boolean
  ssl: SSL
  rewrite_rules: string
  proxy_target: string
  dir_protect: DirProtectView[]
  redirects: Redirect[]
  anti_leech: AntiLeech
  access_log: string
  error_log: string
  custom_config: string
  config: string
  created_by: number | null
  created_at: number
  updated_at: number
}

export interface RewriteTemplate {
  id: string
  name: string
  content: string
}

export interface SiteSettings {
  web_root: string
  conf_dir: string
  log_dir: string
  php_socket: string
}

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

/** splitList 把空格 / 逗号 / 换行分隔的字符串切成去空白、去空项的数组。 */
export function splitList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// PHP 版本下拉候选(后端按 validPHPVersion 白名单校验,这里给常见档)。
export const PHP_VERSIONS = ['8.3', '8.2', '8.1', '8.0', '7.4']

// 字段样式串:与 Ftp.tsx 等页保持一致,供裸 select / textarea 复用。
export const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40'

export const textareaClass =
  'w-full resize-y rounded-(--radius-card) border border-border bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60'

// 允许的 HTTP 错误码白名单(后端同样校验),用于自定义错误页下拉。
export const ERROR_CODES = [400, 401, 403, 404, 405, 500, 502, 503, 504]

// send_host 下拉候选:空 = 不改 Host 头。
export const SEND_HOST_OPTIONS = ['', '$host', '$proxy_host']

/** download 带 Bearer 拉二进制并触发浏览器下载(走裸 fetch,绕过强制 JSON 的 apiFetch)。 */
export async function download(path: string, filename: string): Promise<void> {
  const t = tokenStore.get()
  const headers: Record<string, string> = t ? { Authorization: `Bearer ${t.access}` } : {}
  const res = await fetch(path, { headers })
  if (!res.ok) throw new Error((await res.text()) || '下载失败')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
