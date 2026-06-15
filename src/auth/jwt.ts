// JWT 是 base64url(用 -/_ 替代 +/、无 padding),标准 atob 会失败,需先转回 base64。
function b64urlDecode(s: string): string {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  return atob(t + '='.repeat((4 - (t.length % 4)) % 4))
}

/** 从 access JWT payload 解出 role(不验签,仅用于 UI 角色门)。解析失败给空角色。 */
export function roleFromAccess(access: string | undefined): string {
  if (!access) return ''
  const parts = access.split('.')
  if (parts.length !== 3) return ''
  try {
    const payload = JSON.parse(b64urlDecode(parts[1]))
    return typeof payload.role === 'string' ? payload.role : ''
  } catch {
    return ''
  }
}
