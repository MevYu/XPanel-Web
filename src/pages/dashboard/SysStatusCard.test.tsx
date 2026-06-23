import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { SysStatusCard } from './SysStatusCard'
import type { Metrics, DetailMetrics } from '../../api/types'

const M: Metrics = {
  cpu_percent: 42.5,
  mem_total: 16_000_000_000,
  mem_used: 8_000_000_000,
  disk_total: 500_000_000_000,
  disk_used: 480_000_000_000,
}

const DETAIL: DetailMetrics = {
  cpu_per_core: [10, 90, 30, 50],
  load: { load1: 2, load5: 1.5, load15: 1 },
  memory: {
    total: 16_000_000_000,
    used: 8_000_000_000,
    available: 7_000_000_000,
    free: 6_000_000_000,
    cached: 1_000_000_000,
    buffers: 500_000_000,
    swap_total: 2_000_000_000,
    swap_used: 100_000_000,
    swap_free: 1_900_000_000,
  },
  network: [],
  disk_io: [{ name: 'sda', read_bytes: 0, write_bytes: 0, read_count: 0, write_count: 0 }],
  uptime_sec: 1000,
  boot_time: 0,
}

describe('SysStatusCard', () => {
  it('renders the three status rings with readings and labels', () => {
    render(<SysStatusCard m={M} detail={DETAIL} sysinfo={null} />)
    expect(screen.getAllByText('负载').length).toBeGreaterThan(0)
    expect(screen.getByText('cpu')).toBeInTheDocument()
    expect(screen.getByText('内存')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /负载 2.00/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cpu 42.5%/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /内存 50%/ })).toBeInTheDocument()
  })

  it('shows aaPanel-style subtitles under each ring', () => {
    render(<SysStatusCard m={M} detail={DETAIL} sysinfo={null} />)
    // 负载比 0.5 < 0.7 → 平稳
    expect(screen.getByText('运行平稳')).toBeInTheDocument()
    expect(screen.getByText('2.00 / 1.50 / 1.00')).toBeInTheDocument()
    expect(screen.getByText('4 核')).toBeInTheDocument()
  })

  it('reveals CPU per-core detail on hover', () => {
    render(<SysStatusCard m={M} detail={DETAIL} sysinfo={null} />)
    const cpuButton = screen.getByRole('button', { name: /cpu 42.5%/ })
    const group = cpuButton.closest('.group') as HTMLElement
    const tip = within(group).getByRole('tooltip', { hidden: true })
    expect(tip).toHaveAttribute('aria-hidden', 'true')
    fireEvent.mouseEnter(group)
    expect(tip).toHaveAttribute('aria-hidden', 'false')
    expect(within(tip).getByText('核0')).toBeInTheDocument()
    expect(within(tip).getByText('核3')).toBeInTheDocument()
  })

  it('renders without detail panels when detail is null', () => {
    render(<SysStatusCard m={M} detail={null} sysinfo={null} />)
    expect(screen.getByText('0.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cpu 42.5%/ })).toBeInTheDocument()
  })
})
