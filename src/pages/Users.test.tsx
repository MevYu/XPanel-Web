import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  tokenStore: { get: () => null },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }))

import Users from './Users'

afterEach(() => {
  apiFetch.mockReset()
  vi.restoreAllMocks()
})

const USERS = [{ id: 1, username: 'root', role: 'admin', created_at: 1700000000, totp_enabled: true }]

function mockEndpoints() {
  apiFetch.mockImplementation((path: string) => {
    if (path === '/api/m/users/users') return Promise.resolve(USERS)
    if (path === '/api/m/users/api-keys') return Promise.resolve([])
    return Promise.resolve(undefined)
  })
}

describe('Users page', () => {
  it('lists panel users in a table with 2FA state', async () => {
    mockEndpoints()
    render(<Users />)
    await screen.findByText('root')
    expect(screen.getByText('管理员')).toBeInTheDocument()
    expect(screen.getByText('已开启')).toBeInTheDocument()
  })

  it('deletes a user with the danger-confirm header', async () => {
    mockEndpoints()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Users />)
    await screen.findByText('root')

    fireEvent.click(screen.getByRole('button', { name: '删除用户' }))

    await waitFor(() => {
      const call = apiFetch.mock.calls.find(
        (c) => c[0] === '/api/m/users/users/1' && (c[1] as RequestInit)?.method === 'DELETE',
      )
      expect(call).toBeTruthy()
      expect((call?.[1] as RequestInit).headers).toMatchObject({ 'X-Confirm-Danger': '1' })
    })
  })

  it('opens the add-user modal', async () => {
    mockEndpoints()
    render(<Users />)
    await screen.findByText('root')

    fireEvent.click(screen.getByRole('button', { name: /添加用户/ }))
    expect(await screen.findByRole('button', { name: '创建用户' })).toBeInTheDocument()
  })
})
