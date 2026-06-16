import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  tokenStore: { get: () => null },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }))

import Database from './Database'

afterEach(() => {
  apiFetch.mockReset()
  vi.restoreAllMocks()
})

const BACKUPS = [
  {
    id: 'b1',
    engine: 'mysql',
    db_name: 'shop',
    filename: 'shop-2026.sql.gz',
    size: 2048,
    created_at: '2026-06-15T10:00:00Z',
  },
]

function route(path: string): unknown {
  if (path === '/api/m/database/backups') return BACKUPS
  if (path.endsWith('/databases')) return ['shop']
  if (path.endsWith('/users')) return []
  return undefined
}

describe('Database backups', () => {
  it('lists backups and restores with the danger-confirm header', async () => {
    apiFetch.mockImplementation((path: string) => Promise.resolve(route(path)))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<Database />)
    fireEvent.click(screen.getByRole('button', { name: '备份记录' }))

    await screen.findByText('shop')
    expect(screen.getByText(/shop-2026\.sql\.gz/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '恢复' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/m/database/backups/b1/restore',
        { method: 'POST', headers: { 'X-Confirm-Danger': '1' } },
      ),
    )
  })

  it('triggers a database backup from the engine panel', async () => {
    apiFetch.mockImplementation((path: string) => Promise.resolve(route(path)))

    render(<Database />)
    await screen.findByText('shop')

    fireEvent.click(screen.getByRole('button', { name: '备份' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/m/database/mysql/databases/shop/backup',
        { method: 'POST' },
      ),
    )
  })
})
