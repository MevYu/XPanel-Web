import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  tokenStore: { get: () => null },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }))

import Php from './Php'

afterEach(() => {
  apiFetch.mockReset()
  vi.restoreAllMocks()
})

const VERSIONS = [
  { version: '8.3', banner: 'PHP 8.3.0', fpm_unit: 'php-fpm-8.3', fpm_active: true, cli_default: true },
]

function route(path: string): unknown {
  if (path === '/api/m/php/versions') return VERSIONS
  if (path === '/api/m/php/cli') return { available: true, banner: 'PHP 8.3.0 (cli)' }
  if (path === '/api/m/php/ini/schema')
    return [{ key: 'memory_limit', label: '内存限制', group: '资源', desc: '单进程上限' }]
  if (path === '/api/m/php/versions/8.3/ini') return { memory_limit: '256M' }
  if (path === '/api/m/php/disabled-functions/candidates') return ['exec', 'system']
  if (path === '/api/m/php/versions/8.3/disabled-functions') return ['exec']
  return undefined
}

describe('Php page', () => {
  it('shows empty state when no versions are installed', async () => {
    apiFetch.mockImplementation((path: string) =>
      Promise.resolve(path === '/api/m/php/versions' ? [] : undefined),
    )
    render(<Php />)
    await screen.findByText('未检测到 PHP')
  })

  it('renders versions, CLI banner and the ini config form', async () => {
    apiFetch.mockImplementation((path: string) => Promise.resolve(route(path)))
    render(<Php />)

    await screen.findByText('PHP 8.3')
    expect(screen.getByText('CLI 默认')).toBeInTheDocument()
    expect(screen.getByText(/PHP 8\.3\.0 \(cli\)/)).toBeInTheDocument()
    // ini 表单默认 tab,从 schema 渲染字段。
    await screen.findByDisplayValue('256M')
  })

  it('saves disabled functions with the danger-confirm header', async () => {
    apiFetch.mockImplementation((path: string) => Promise.resolve(route(path)))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<Php />)
    await screen.findByText('PHP 8.3')

    fireEvent.click(screen.getByRole('button', { name: '禁用函数' }))
    await screen.findByRole('button', { name: '保存禁用函数' })
    fireEvent.click(screen.getByRole('button', { name: '保存禁用函数' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/m/php/versions/8.3/disabled-functions',
        expect.objectContaining({ method: 'PUT', headers: { 'X-Confirm-Danger': '1' } }),
      ),
    )
  })
})
