import { describe, it, expect } from 'vitest'
import { roleFromAccess } from './jwt'

// 构造 base64url payload(含 -/_、无 padding)。
function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('roleFromAccess', () => {
  it('decodes role from a base64url payload', () => {
    const token = `header.${b64url({ role: 'operator' })}.sig`
    expect(roleFromAccess(token)).toBe('operator')
  })

  it('decodes payload containing -/_ characters', () => {
    // 选一个 base64 标准编码会出现 +// 的 payload,确认 base64url 路径正确。
    const payload = { role: 'operator', sub: 'ab>?ff?' }
    const std = btoa(JSON.stringify(payload))
    expect(std).toMatch(/[+/]/)
    const token = `header.${b64url(payload)}.sig`
    expect(roleFromAccess(token)).toBe('operator')
  })

  it('returns empty string for undefined access', () => {
    expect(roleFromAccess(undefined)).toBe('')
  })

  it('returns empty string when not three parts', () => {
    expect(roleFromAccess('only.two')).toBe('')
  })

  it('returns empty string on malformed payload', () => {
    expect(roleFromAccess('header.@@@.sig')).toBe('')
  })

  it('returns empty string when role is missing', () => {
    const token = `header.${b64url({ sub: 'x' })}.sig`
    expect(roleFromAccess(token)).toBe('')
  })
})
