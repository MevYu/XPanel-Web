import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ModuleView } from '../api/types'

const useModulesMock = vi.fn()
vi.mock('../hooks/useModules', () => ({
  useModules: () => useModulesMock(),
}))

import { InstallGate } from './InstallGate'

function mod(over: Partial<ModuleView>): ModuleView {
  return {
    id: 'sites',
    name: 'Sites',
    category: 'web',
    requires: [],
    always_on: false,
    enabled: true,
    nav: [],
    ...over,
  }
}

function result(all: ModuleView[], loading = false) {
  return { all, enabled: all.filter((m) => m.enabled), loading, error: null, reload: vi.fn() }
}

describe('InstallGate', () => {
  beforeEach(() => {
    useModulesMock.mockReset()
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('renders children unobstructed when health.ok is true', () => {
    useModulesMock.mockReturnValue(result([mod({ id: 'sites', health: { ok: true, reason: '' } })]))
    render(
      <InstallGate moduleId="sites">
        <div>功能内容</div>
      </InstallGate>,
    )
    expect(screen.getByText('功能内容')).toBeInTheDocument()
    expect(screen.queryByText(/需要安装/)).not.toBeInTheDocument()
  })

  it('renders children while loading without install prompt', () => {
    useModulesMock.mockReturnValue(result([], true))
    render(
      <InstallGate moduleId="sites">
        <div>功能内容</div>
      </InstallGate>,
    )
    expect(screen.getByText('功能内容')).toBeInTheDocument()
    expect(screen.queryByText(/需要安装/)).not.toBeInTheDocument()
  })

  it('shows install overlay with app name and commands when health.ok is false and APP_DEPS has entry', () => {
    useModulesMock.mockReturnValue(
      result([mod({ id: 'sites', health: { ok: false, reason: 'nginx 未安装' } })]),
    )
    render(
      <InstallGate moduleId="sites">
        <div>功能内容</div>
      </InstallGate>,
    )
    expect(screen.getByText('需要安装 Nginx')).toBeInTheDocument()
    expect(screen.getByText('nginx 未安装')).toBeInTheDocument()
    expect(
      screen.getByText('sudo apt update && sudo apt install -y nginx'),
    ).toBeInTheDocument()
  })

  it('copies command to clipboard on copy button click', async () => {
    useModulesMock.mockReturnValue(
      result([mod({ id: 'sites', health: { ok: false, reason: 'nginx 未安装' } })]),
    )
    render(
      <InstallGate moduleId="sites">
        <div>功能内容</div>
      </InstallGate>,
    )
    const copyBtns = screen.getAllByRole('button', { name: /复制/ })
    fireEvent.click(copyBtns[0])
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'sudo apt update && sudo apt install -y nginx',
    )
  })

  it('shows generic fallback when no APP_DEPS entry', () => {
    useModulesMock.mockReturnValue(
      result([
        mod({ id: 'unknownmod', enabled: true, health: { ok: false, reason: '服务未就绪' } }),
      ]),
    )
    render(
      <InstallGate moduleId="unknownmod">
        <div>功能内容</div>
      </InstallGate>,
    )
    expect(screen.getByText(/服务未就绪/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /复制/ })).not.toBeInTheDocument()
  })
})
