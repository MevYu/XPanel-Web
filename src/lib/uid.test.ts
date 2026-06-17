import { describe, it, expect, afterEach } from 'vitest'
import { uid } from './uid'

const realRandomUUID = globalThis.crypto?.randomUUID

afterEach(() => {
  if (realRandomUUID) {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: realRandomUUID,
      configurable: true,
      writable: true,
    })
  }
})

describe('uid', () => {
  it('返回非空字符串', () => {
    expect(typeof uid()).toBe('string')
    expect(uid().length).toBeGreaterThan(0)
  })

  it('多次调用唯一', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uid()))
    expect(ids.size).toBe(1000)
  })

  it('非安全上下文(无 crypto.randomUUID)不抛且仍唯一', () => {
    // 模拟局域网普通 HTTP:crypto 存在但 randomUUID 不可用。
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    expect(globalThis.crypto.randomUUID).toBeUndefined()
    expect(() => uid()).not.toThrow()
    const ids = new Set(Array.from({ length: 1000 }, () => uid()))
    expect(ids.size).toBe(1000)
    expect(uid()).toMatch(/^id-/)
  })

  it('crypto 整体缺失也不抛', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      expect(() => uid()).not.toThrow()
      expect(uid()).toMatch(/^id-/)
    } finally {
      if (orig) Object.defineProperty(globalThis, 'crypto', orig)
    }
  })
})
