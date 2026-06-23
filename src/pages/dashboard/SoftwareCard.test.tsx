import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ModuleView } from '../../api/types'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

const allMock = vi.fn(() => [] as ModuleView[])
vi.mock('../../hooks/useModules', () => ({
  useModules: () => ({ all: allMock(), enabled: [], loading: false, error: null, reload: vi.fn() }),
}))

const apiFetch = vi.fn()
vi.mock('../../api/client', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { SoftwareCard } from './SoftwareCard'

function mod(id: string, name: string, nav?: { icon: string; path: string }): ModuleView {
  return {
    id,
    name,
    category: 'app',
    enabled: true,
    nav: nav ? [{ label: name, icon: nav.icon, path: nav.path }] : [],
  } as ModuleView
}

function renderCard() {
  return render(
    <MemoryRouter>
      <SoftwareCard />
    </MemoryRouter>,
  )
}

// home 让 GET /home-apps 返回给定有序列表;PUT 解析为 resolve。
function home(ids: string[]) {
  apiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return Promise.resolve(undefined)
    if (path === '/api/m/dashboard/home-apps') return Promise.resolve({ modules: ids })
    return Promise.resolve(undefined)
  })
}

afterEach(() => {
  navigate.mockReset()
  apiFetch.mockReset()
  allMock.mockReturnValue([])
})

describe('SoftwareCard', () => {
  it('renders only the modules listed in home-apps, in order', async () => {
    allMock.mockReturnValue([
      mod('sites', 'Nginx 站点', { icon: 'globe', path: '/sites' }),
      mod('database', 'MySQL', { icon: 'database', path: '/database' }),
      mod('redis', 'Redis', { icon: 'database', path: '/redis' }),
    ])
    home(['database', 'sites'])
    renderCard()

    await waitFor(() => expect(screen.getByText('MySQL')).toBeInTheDocument())
    expect(screen.getByText('Nginx 站点')).toBeInTheDocument()
    expect(screen.queryByText('Redis')).not.toBeInTheDocument()
  })

  it('navigates to the module nav path on tile click', async () => {
    allMock.mockReturnValue([mod('sites', 'Nginx 站点', { icon: 'globe', path: '/sites' })])
    home(['sites'])
    renderCard()

    await waitFor(() => expect(screen.getByText('Nginx 站点')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Nginx 站点' }))
    expect(navigate).toHaveBeenCalledWith('/sites')
  })

  it('shows an empty state when no software is configured for home', async () => {
    allMock.mockReturnValue([mod('sites', 'Nginx 站点', { icon: 'globe', path: '/sites' })])
    home([])
    renderCard()

    await waitFor(() => expect(screen.getByText('暂无首页软件')).toBeInTheDocument())
  })

  it('persists the new order after a drag-and-drop', async () => {
    allMock.mockReturnValue([
      mod('sites', 'Nginx 站点', { icon: 'globe', path: '/sites' }),
      mod('database', 'MySQL', { icon: 'database', path: '/database' }),
    ])
    home(['sites', 'database'])
    renderCard()

    await waitFor(() => expect(screen.getByText('MySQL')).toBeInTheDocument())
    const sites = screen.getByRole('button', { name: 'Nginx 站点' })
    const database = screen.getByRole('button', { name: 'MySQL' })

    fireEvent.dragStart(sites)
    fireEvent.dragOver(database)
    fireEvent.drop(database)

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/m/dashboard/home-apps', {
        method: 'PUT',
        body: JSON.stringify({ modules: ['database', 'sites'] }),
      }),
    )
  })
})
