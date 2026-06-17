// uid 生成唯一字符串 id(标签 key 等用途,非密码学强度)。
// crypto.randomUUID 仅安全上下文(HTTPS/localhost)可用;局域网普通 HTTP 下不存在,
// 直接调用会 TypeError,故此处守卫并回退到时间戳 + 随机数。
export function uid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}
