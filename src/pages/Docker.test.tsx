import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  tokenStore: { get: () => null },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }))

import Docker from './Docker'

afterEach(() => {
  apiFetch.mockReset()
  vi.restoreAllMocks()
})

// 写/危险操作端点返回 text/plain,走裸 fetch;用一个可控的全局 fetch mock 拦截。
function mockFetch(): ReturnType<typeof vi.fn> {
  const fn = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Response),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('Docker containers tab', () => {
  it('renders the container table and runs a danger remove with the confirm header', async () => {
    const fetchFn = mockFetch()
    apiFetch.mockImplementation((path: string) => {
      if (path === '/api/m/docker/containers')
        return Promise.resolve([{ ID: 'abc123', Names: 'web', State: 'running', Status: 'Up 2h', Image: 'nginx:latest', Ports: '80/tcp' }])
      if (path === '/api/m/docker/containers/stats')
        return Promise.resolve([{ Name: 'web', CPUPerc: '0.50%', MemPerc: '1.2%' }])
      return Promise.resolve([])
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<Docker />)

    await screen.findByText('web')
    expect(screen.getByText('nginx:latest')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() => {
      const call = fetchFn.mock.calls.find((c) => String(c[0]).includes('/containers/web'))
      expect(call).toBeTruthy()
      const init = call![1] as RequestInit
      expect(init.method).toBe('DELETE')
      expect((init.headers as Record<string, string>)['X-Confirm-Danger']).toBe('1')
    })
  })

  it('shows the not-ready empty state when docker is offline (502)', async () => {
    mockFetch()
    apiFetch.mockRejectedValue(new Error('502 docker command failed'))

    render(<Docker />)

    await screen.findByText('Docker 未就绪')
    // 离线时不应抛出未捕获错误,也不应渲染表格行。
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('Docker registries tab', () => {
  it('adds a registry without echoing the password back', async () => {
    const fetchFn = mockFetch()
    apiFetch.mockImplementation((path: string) => {
      if (path === '/api/m/docker/registries') return Promise.resolve([])
      return Promise.resolve([])
    })

    render(<Docker />)
    fireEvent.click(screen.getByRole('button', { name: '仓库' }))

    await screen.findByText('暂无仓库凭证。')
    fireEvent.click(screen.getByRole('button', { name: '添加仓库' }))

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'hub' } })
    fireEvent.change(screen.getByLabelText('服务器地址'), { target: { value: 'registry.example.com' } })
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 's3cret' } })

    fireEvent.click(screen.getByRole('button', { name: '添加' }))

    await waitFor(() => {
      const call = fetchFn.mock.calls.find(
        (c) => String(c[0]) === '/api/m/docker/registries' && (c[1] as RequestInit)?.method === 'POST',
      )
      expect(call).toBeTruthy()
      const body = JSON.parse((call![1] as RequestInit).body as string)
      expect(body).toMatchObject({ name: 'hub', server: 'registry.example.com', username: 'alice', password: 's3cret' })
    })
  })
})
