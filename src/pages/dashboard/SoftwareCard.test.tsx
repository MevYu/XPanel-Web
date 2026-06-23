import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ModuleView } from '../../api/types'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

const modulesMock = vi.fn(() => [] as ModuleView[])
vi.mock('../../hooks/useModules', () => ({
  useModules: () => ({ all: [], enabled: modulesMock(), loading: false, error: null, reload: vi.fn() }),
}))

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

afterEach(() => {
  navigate.mockReset()
  modulesMock.mockReturnValue([])
})

describe('SoftwareCard', () => {
  it('renders an entry tile per enabled module, excluding system pages', () => {
    modulesMock.mockReturnValue([
      mod('dashboard', '系统总览', { icon: 'gauge', path: '/' }),
      mod('sites', 'Nginx 站点', { icon: 'globe', path: '/sites' }),
      mod('database', 'MySQL', { icon: 'database', path: '/database' }),
    ])
    renderCard()

    expect(screen.getByText('Nginx 站点')).toBeInTheDocument()
    expect(screen.getByText('MySQL')).toBeInTheDocument()
    expect(screen.queryByText('系统总览')).not.toBeInTheDocument()
  })

  it('navigates to the module nav path on tile click', () => {
    modulesMock.mockReturnValue([mod('sites', 'Nginx 站点', { icon: 'globe', path: '/sites' })])
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Nginx 站点' }))
    expect(navigate).toHaveBeenCalledWith('/sites')
  })

  it('falls back to /{id} when a module has no nav', () => {
    modulesMock.mockReturnValue([mod('redis', 'Redis')])
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Redis' }))
    expect(navigate).toHaveBeenCalledWith('/redis')
  })

  it('shows an empty state when no software is enabled', () => {
    modulesMock.mockReturnValue([mod('dashboard', '系统总览', { icon: 'gauge', path: '/' })])
    renderCard()

    expect(screen.getByText('暂无已启用软件')).toBeInTheDocument()
  })
})
