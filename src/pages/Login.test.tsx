import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'
import { tokenStore } from '../api/client'
import Login from './Login'

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  tokenStore.clear()
  vi.restoreAllMocks()
})

describe('Login', () => {
  it('renders brand title and credential fields', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: 'XPanel' })).toBeInTheDocument()
    expect(screen.getByLabelText('用户名')).toBeInTheDocument()
    expect(screen.getByLabelText('密码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()
  })

  it('shows TOTP field on 2fa_required, then logs in with the code', async () => {
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      const body = JSON.parse(init.body) as { totp?: string }
      if (!body.totp) {
        return new Response(JSON.stringify({ code: '2fa_required' }), { status: 401 })
      }
      return new Response(JSON.stringify({ access: 'a', refresh: 'r' }), { status: 200 })
    }) as any

    renderLogin()
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))

    // 不报"密码错",而是展开 TOTP 输入。
    const totp = await screen.findByLabelText('两步验证码')
    expect(screen.queryByText('用户名或密码不正确')).not.toBeInTheDocument()

    fireEvent.change(totp, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '验证' }))
    await waitFor(() => expect(tokenStore.get()?.access).toBe('a'))
  })

  it('shows generic error on a real password failure', async () => {
    globalThis.fetch = vi.fn(async () => new Response('unauthorized', { status: 401 })) as any

    renderLogin()
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('用户名或密码不正确')).toBeInTheDocument()
    expect(screen.queryByLabelText('两步验证码')).not.toBeInTheDocument()
  })
})
