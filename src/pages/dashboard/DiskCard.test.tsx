import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../../api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}))

import { DiskCard } from './DiskCard'
import type { Metrics, DiskPartition } from '../../api/types'

afterEach(() => {
  apiFetch.mockReset()
  vi.restoreAllMocks()
})

const M: Metrics = {
  cpu_percent: 0,
  mem_total: 16_000_000_000,
  mem_used: 8_000_000_000,
  disk_total: 500_000_000_000,
  disk_used: 480_000_000_000, // 96%
}

const PARTS: DiskPartition[] = [
  {
    device: '/dev/sda1',
    mountpoint: '/',
    fstype: 'ext4',
    total: 100_000_000_000,
    used: 50_000_000_000,
    free: 50_000_000_000,
    used_percent: 50,
  },
]

describe('DiskCard', () => {
  it('lists disk partitions with usage when partitions are available', async () => {
    apiFetch.mockResolvedValue(PARTS)
    render(<DiskCard m={M} />)
    await screen.findByText('/')
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('falls back to aggregate disk row when partitions are empty', async () => {
    apiFetch.mockResolvedValue([])
    render(<DiskCard m={M} />)
    await waitFor(() => expect(screen.getByText('96%')).toBeInTheDocument())
  })

  it('falls back to aggregate disk row when the endpoint fails', async () => {
    apiFetch.mockRejectedValue(new Error('disabled'))
    render(<DiskCard m={M} />)
    await waitFor(() => expect(screen.getByText('96%')).toBeInTheDocument())
  })
})
