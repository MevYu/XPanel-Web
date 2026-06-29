import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../../api/client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}))

import { RemoteFilesModal } from './RemoteFilesModal'
import type { Remote } from './shared'

const remote: Remote = {
  id: 7,
  name: 's3-backup',
  type: 's3',
  bucket: 'my-bucket',
  endpoint: '',
  region: '',
  access_key: '',
  secret_set: true,
  created_at: 0,
}

afterEach(() => {
  apiFetch.mockReset()
})

describe('RemoteFilesModal', () => {
  it('fetches the remote files endpoint and lists returned filenames', async () => {
    apiFetch.mockResolvedValue(['path-www-20260101.tar.gz', 'mysql-shop-20260102.sql'])

    render(<RemoteFilesModal remote={remote} onClose={() => {}} />)

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/m/backup/remotes/7/files'))
    expect(await screen.findByText('path-www-20260101.tar.gz')).toBeInTheDocument()
    expect(screen.getByText('mysql-shop-20260102.sql')).toBeInTheDocument()
  })

  it('shows an empty state when the remote has no backup files', async () => {
    apiFetch.mockResolvedValue([])

    render(<RemoteFilesModal remote={remote} onClose={() => {}} />)

    expect(await screen.findByText('该远端暂无备份文件')).toBeInTheDocument()
  })
})
