// DNS 模块共享:类型、文案、校验常量。后端契约以 internal/modules/dns 为准。

export const DANGER = { 'X-Confirm-Danger': '1' }

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const
export type RecordType = (typeof RECORD_TYPES)[number]
export const PRIORITY_TYPES = new Set<RecordType>(['MX', 'SRV'])

export interface Domain {
  id: number
  name: string
  created_at: number
}

export interface DnsRecord {
  id: number
  name: string
  type: string
  value: string
  ttl: number
  priority: number
}

export interface Settings {
  provider_kind: string
  provider_creds: string
  bind_zone_dir: string
}

export const PROVIDER_KINDS: { value: string; label: string }[] = [
  { value: 'bind', label: 'bind(本地 BIND)' },
  { value: 'mock', label: 'mock(示例/测试)' },
]

export function providerLabel(kind: string): string {
  return PROVIDER_KINDS.find((p) => p.value === kind)?.label ?? kind
}

export function ttlValid(ttl: number): boolean {
  return Number.isInteger(ttl) && ttl >= 60 && ttl <= 604800
}

// 字段样式串:供裸 select 复用,与共享 Input 视觉对齐。
export const fieldClass =
  'h-10 rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 text-sm text-text outline-none transition placeholder:text-faint hover:border-border-strong focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40'
