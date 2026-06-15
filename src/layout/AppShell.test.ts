import { describe, it, expect } from 'vitest'
import { resolveTitle } from './AppShell'

describe('resolveTitle', () => {
  it('maps known static routes when no module nav matches', () => {
    expect(resolveTitle('/dashboard', [])).toBe('系统总览')
    expect(resolveTitle('/modules', [])).toBe('模块管理')
    expect(resolveTitle('/service', [])).toBe('服务管理')
  })

  it('falls back to 控制台 for unknown routes', () => {
    expect(resolveTitle('/unknown', [])).toBe('控制台')
  })

  it('prefers module nav label over static fallback', () => {
    const enabled = [{ nav: [{ label: '日志', icon: 'list', path: '/service' }] }]
    expect(resolveTitle('/service', enabled)).toBe('日志')
  })

  it('tolerates modules with null nav', () => {
    const enabled = [{ nav: null as unknown as [] }]
    expect(resolveTitle('/dashboard', enabled)).toBe('系统总览')
  })
})
