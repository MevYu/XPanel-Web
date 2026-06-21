import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  tokenStore: { get: () => null },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }))
// InstallGate 经 useModules 取 health;mock 成已就绪,让遮罩透传出功能内容。
vi.mock('../hooks/useModules', () => ({
  useModules: () => ({
    all: [
      {
        id: 'sites',
        name: 'Sites',
        category: 'web',
        requires: [],
        always_on: false,
        enabled: true,
        nav: [],
        health: { ok: true, reason: '' },
      },
    ],
    enabled: [],
    loading: false,
    error: null,
    reload: () => {},
  }),
}))

import Sites from './Sites'

afterEach(() => {
  apiFetch.mockReset()
  vi.restoreAllMocks()
})

const SITES = [
  {
    id: 1,
    name: 'example.com',
    domains: ['example.com', 'www.example.com'],
    kind: 'static',
    listen: 80,
    enabled: true,
    config: 'server { listen 80; }',
    created_by: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
  },
  {
    id: 2,
    name: 'api.example.com',
    domains: ['api.example.com'],
    kind: 'proxy',
    listen: 80,
    enabled: false,
    config: 'server { listen 80; }',
    created_by: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
  },
]

describe('Sites list', () => {
  it('lists sites and filters by kind', async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === '/api/m/sites/sites') return Promise.resolve(SITES)
      return Promise.resolve(undefined)
    })
    render(<Sites />)
    await screen.findByText('example.com')
    expect(screen.getAllByText('api.example.com').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'PHP' }))
    await screen.findByText('没有匹配的站点')
    expect(screen.queryByText('example.com')).not.toBeInTheDocument()
  })

  it('deletes a site with the danger-confirm header', async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === '/api/m/sites/sites') return Promise.resolve(SITES)
      return Promise.resolve(undefined)
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Sites />)
    await screen.findByText('example.com')

    const delButtons = screen.getAllByRole('button', { name: '删除站点' })
    fireEvent.click(delButtons[0])

    await waitFor(() => {
      const call = apiFetch.mock.calls.find(
        (c) => c[0] === '/api/m/sites/sites/1' && (c[1] as RequestInit)?.method === 'DELETE',
      )
      expect(call).toBeTruthy()
      expect((call?.[1] as RequestInit).headers).toMatchObject({ 'X-Confirm-Danger': '1' })
    })
  })

  it('opens the detail drawer with tabs', async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === '/api/m/sites/sites') return Promise.resolve(SITES)
      if (path === '/api/m/sites/sites/1') return Promise.resolve(SITES[0])
      return Promise.resolve(undefined)
    })
    render(<Sites />)
    const name = await screen.findByText('example.com')
    fireEvent.click(name)

    expect(await screen.findByRole('button', { name: /概览/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /域名/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /配置文件/ })).toBeInTheDocument()
  })
})
