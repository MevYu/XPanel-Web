import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  tokenStore: { get: () => ({ access: 'tok', refresh: 'r' }) },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }))

import Service from './Service'

afterEach(() => {
  apiFetch.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// 后端 active 为 systemd ActiveState(active/failed/...),enabled 为字符串(enabled/disabled/...)。
const SERVICES = [
  { name: 'nginx.service', description: 'Web server', active: 'active', sub: 'running', enabled: 'enabled' },
  { name: 'mysql.service', description: 'Database', active: 'failed', sub: 'failed', enabled: 'disabled' },
]

describe('Service', () => {
  it('lists services with status badges and filters by query', async () => {
    apiFetch.mockResolvedValue(SERVICES)
    render(<Service />)

    await screen.findByText('nginx.service')
    expect(screen.getByText('mysql.service')).toBeInTheDocument()
    expect(screen.getByText('运行中')).toBeInTheDocument()
    expect(screen.getByText('失败')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: 'nginx' } })
    expect(screen.getByText('nginx.service')).toBeInTheDocument()
    expect(screen.queryByText('mysql.service')).not.toBeInTheDocument()
  })

  it('issues a start action via bare fetch with the danger header', async () => {
    apiFetch.mockResolvedValue(SERVICES)
    // verb 端点返回 text/plain,走裸 fetch;mock 全局 fetch 验证 URL 与危险头。
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'done' })
    vi.stubGlobal('fetch', fetchMock)
    render(<Service />)
    await screen.findByText('nginx.service')

    // nginx 是第一行,其「启动」是第一个 start 按钮。
    fireEvent.click(screen.getAllByRole('button', { name: '启动' })[0])

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/m/service/start?unit=nginx.service')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Confirm-Danger']).toBe('1')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })
})
