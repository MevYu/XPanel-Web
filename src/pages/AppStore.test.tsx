import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  tokenStore: { get: () => null },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }))

import AppStore from './AppStore'

afterEach(() => {
  apiFetch.mockReset()
  vi.restoreAllMocks()
})

const INSTANCE = {
  id: 7,
  app_id: 'redis',
  name: 'redis-demo',
  params: { port: '6379' },
  status: 'running',
  project_dir: '/opt/xpanel/apps/redis-demo',
  created_at: 1_700_000_000,
  updated_at: 1_700_000_500,
}

// status/logs 端点返回 text/plain,走裸 fetch;用全局 fetch mock 拦截并按 URL 分流。
function mockTextFetch() {
  const fn = vi.fn((url: string) => {
    const body = url.includes('/status') ? 'NAME   STATE\nredis-demo running' : 'log line one\nlog line two'
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) } as Response)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('AppStore instance detail modal', () => {
  it('opens detail via GET /instances/{id}, polls status and loads logs from the text/plain endpoints', async () => {
    const fetchFn = mockTextFetch()
    apiFetch.mockImplementation((path: string) => {
      if (path === '/api/m/appstore/apps') return Promise.resolve([])
      if (path === '/api/m/appstore/instances') return Promise.resolve([INSTANCE])
      if (path === '/api/m/appstore/instances/7') return Promise.resolve(INSTANCE)
      return Promise.resolve([])
    })

    render(<AppStore />)

    // 切到「已安装」实例视图,实例行出现。
    fireEvent.click(screen.getByRole('button', { name: '已安装' }))
    await screen.findByText('redis-demo')

    // 点击实例名打开详情 → 触发 GET /instances/{id}(填补 BACKEND_ONLY 缺口)。
    fireEvent.click(screen.getByRole('button', { name: 'redis-demo' }))
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/m/appstore/instances/7')
    })
    expect(await screen.findByText('/opt/xpanel/apps/redis-demo')).toBeInTheDocument()

    // 状态 tab → text/plain 轮询 compose ps。
    fireEvent.click(screen.getByRole('button', { name: '状态' }))
    await waitFor(() => {
      expect(fetchFn.mock.calls.some((c) => String(c[0]).includes('/instances/7/status'))).toBe(true)
    })

    // 日志 tab → text/plain compose logs(带 tail)。
    fireEvent.click(screen.getByRole('button', { name: '日志' }))
    await waitFor(() => {
      expect(fetchFn.mock.calls.some((c) => String(c[0]).includes('/instances/7/logs?tail=200'))).toBe(true)
    })
    await screen.findByText(/log line one/)
  })
})
