import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiFetch, tokenStore } from './client'

beforeEach(() => tokenStore.set({ access: 'a1', refresh: 'r1' }))

describe('apiFetch', () => {
  it('retries once after refreshing on 401', async () => {
    const calls: string[] = []
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push(`${url}|${init?.headers?.Authorization ?? ''}`)
      if (url === '/api/data' && init.headers.Authorization === 'Bearer a1')
        return new Response('', { status: 401 })
      if (url === '/api/auth/refresh')
        return new Response(JSON.stringify({ access: 'a2', refresh: 'r2' }), { status: 200 })
      if (url === '/api/data' && init.headers.Authorization === 'Bearer a2')
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      return new Response('', { status: 500 })
    }) as any

    const res = await apiFetch('/api/data')
    expect(res).toEqual({ ok: true })
    expect(tokenStore.get()?.access).toBe('a2')
  })

  it('refreshes only once under concurrent 401s', async () => {
    let refreshCount = 0
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      if (url === '/api/auth/refresh') {
        refreshCount++
        return new Response(JSON.stringify({ access: 'a2', refresh: 'r2' }), { status: 200 })
      }
      if (url === '/api/data') {
        return init.headers.Authorization === 'Bearer a2'
          ? new Response(JSON.stringify({ ok: true }), { status: 200 })
          : new Response('', { status: 401 })
      }
      return new Response('', { status: 500 })
    }) as any

    const [r1, r2] = await Promise.all([apiFetch('/api/data'), apiFetch('/api/data')])
    expect(r1).toEqual({ ok: true })
    expect(r2).toEqual({ ok: true })
    expect(refreshCount).toBe(1)
  })

  it('clears tokens when refresh fails', async () => {
    globalThis.fetch = vi.fn(async (url: any) =>
      url === '/api/auth/refresh'
        ? new Response('', { status: 401 })
        : new Response('', { status: 401 })) as any
    await expect(apiFetch('/api/data')).rejects.toThrow()
    expect(tokenStore.get()).toBeNull()
  })
})
