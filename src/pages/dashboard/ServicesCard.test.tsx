import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
const roleMock = vi.fn(() => 'admin')
vi.mock('../../api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  tokenStore: { get: () => ({ access: 'tok', refresh: 'r' }) },
}))
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ role: roleMock() }) }))

import { ServicesCard } from './ServicesCard'

afterEach(() => {
  apiFetch.mockReset()
  roleMock.mockReturnValue('admin')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const SERVICES = [
  { name: 'nginx', active: 'running', version: '1.24.0' },
  { name: 'redis', active: 'dead', version: '7.0.5' },
]

describe('ServicesCard', () => {
  it('renders service name, status and version for admin', async () => {
    apiFetch.mockResolvedValue(SERVICES)
    render(<ServicesCard />)

    await screen.findByText('nginx')
    expect(screen.getByText('redis')).toBeInTheDocument()
    expect(screen.getByText('运行中')).toBeInTheDocument()
    expect(screen.getByText('1.24.0')).toBeInTheDocument()
    expect(screen.getByText('7.0.5')).toBeInTheDocument()
  })

  it('shows action buttons for admin', async () => {
    apiFetch.mockResolvedValue(SERVICES)
    render(<ServicesCard />)

    // 运行中的 nginx 显示重启/重载/停止;已停的 redis 显示启动。
    expect(await screen.findByRole('button', { name: '重启' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '启动' })).toBeInTheDocument()
  })

  it('hides action buttons for non-admin', async () => {
    roleMock.mockReturnValue('viewer')
    apiFetch.mockResolvedValue(SERVICES)
    render(<ServicesCard />)

    await screen.findByText('nginx')
    expect(screen.queryByRole('button', { name: '重启' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '启动' })).not.toBeInTheDocument()
  })

  it('calls the verb endpoint with the danger header on action click', async () => {
    apiFetch.mockResolvedValue(SERVICES)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' })
    vi.stubGlobal('fetch', fetchMock)
    render(<ServicesCard />)

    fireEvent.click(await screen.findByRole('button', { name: '重启' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/m/service/restart?unit=nginx')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Confirm-Danger']).toBe('1')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('shows a friendly empty state when the list request fails', async () => {
    apiFetch.mockRejectedValue(new Error('services unavailable'))
    render(<ServicesCard />)

    expect(await screen.findByText(/暂无法获取服务状态/)).toBeInTheDocument()
    expect(screen.queryByText('nginx')).not.toBeInTheDocument()
  })
})
