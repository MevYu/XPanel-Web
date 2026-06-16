import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }))

import Service from './Service'

afterEach(() => {
  apiFetch.mockReset()
  vi.restoreAllMocks()
})

const SERVICES = [
  { name: 'nginx.service', description: 'Web server', active: 'running', sub: 'running', enabled: true },
  { name: 'mysql.service', description: 'Database', active: 'failed', sub: 'failed', enabled: false },
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

  it('issues a start action for the first listed service', async () => {
    apiFetch.mockResolvedValue(SERVICES)
    render(<Service />)
    await screen.findByText('nginx.service')

    // nginx 是第一行,其「启动」是第一个 start 按钮。
    fireEvent.click(screen.getAllByRole('button', { name: '启动' })[0])

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/m/service/start?unit=nginx.service',
        { method: 'POST' },
      ),
    )
  })
})
