import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { GaugeRow } from './GaugeRow'
import type { Metrics, DetailMetrics } from '../../api/types'

const M: Metrics = {
  cpu_percent: 42.5,
  mem_total: 16_000_000_000,
  mem_used: 8_000_000_000,
  disk_total: 500_000_000_000,
  disk_used: 480_000_000_000, // 96% → crit
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

describe('GaugeRow', () => {
  it('renders the four status gauges with readings and labels', () => {
    render(<GaugeRow m={M} detail={DETAIL} />)
    expect(screen.getByText('负载')).toBeInTheDocument()
    expect(screen.getByText('cpu')).toBeInTheDocument()
    expect(screen.getByText('内存')).toBeInTheDocument()
    expect(screen.getByText('磁盘')).toBeInTheDocument()
    // readings surface via the gauges' accessible names
    expect(screen.getByRole('button', { name: /负载 2.00/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cpu 42.5%/ })).toBeInTheDocument()
  })

  it('exposes each gauge as a button with an accessible label', () => {
    render(<GaugeRow m={M} detail={DETAIL} />)
    expect(screen.getByRole('button', { name: /内存 50%/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /磁盘 96%/ })).toBeInTheDocument()
  })

  it('reveals CPU per-core detail on hover', () => {
    const { container } = render(<GaugeRow m={M} detail={DETAIL} />)
    const cpuButton = screen.getByRole('button', { name: /cpu 42.5%/ })
    const group = cpuButton.closest('.group') as HTMLElement
    const tip = within(group).getByRole('tooltip', { hidden: true })

    expect(tip).toHaveAttribute('aria-hidden', 'true')
    fireEvent.mouseEnter(group)
    expect(tip).toHaveAttribute('aria-hidden', 'false')
    // per-core rows present
    expect(within(tip).getByText('核0')).toBeInTheDocument()
    expect(within(tip).getByText('核3')).toBeInTheDocument()
    expect(container).toBeTruthy()
  })

  it('shows memory used/total/swap detail on hover', () => {
    render(<GaugeRow m={M} detail={DETAIL} />)
    const memButton = screen.getByRole('button', { name: /内存 50%/ })
    const group = memButton.closest('.group') as HTMLElement
    fireEvent.mouseEnter(group)
    const tip = within(group).getByRole('tooltip', { hidden: true })
    expect(within(tip).getByText('已用')).toBeInTheDocument()
    expect(within(tip).getByText('swap')).toBeInTheDocument()
  })

  it('renders without detail panels when detail is null', () => {
    render(<GaugeRow m={M} detail={null} />)
    // cpu/mem gauges have no detail when detail missing; load reading falls back to 0
    expect(screen.getByText('0.00')).toBeInTheDocument()
    // disk detail still available (derived from m only)
    expect(screen.getByRole('button', { name: /磁盘 96%/ })).toBeInTheDocument()
  })
})
