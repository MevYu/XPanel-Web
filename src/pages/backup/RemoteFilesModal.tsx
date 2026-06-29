import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { EmptyState } from '../../components/EmptyState'
import { Cloud } from 'lucide-react'
import { type Remote, errorText } from './shared'

/** RemoteFilesModal 列远端备份文件:只读展示该 rclone 远端上的备份文件名(GET /remotes/{id}/files)。 */
export function RemoteFilesModal({ remote, onClose }: { remote: Remote; onClose: () => void }) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setBusy(true)
    setErr(null)
    apiFetch<string[]>(`/api/m/backup/remotes/${remote.id}/files`)
      .then((list) => {
        if (alive) setFiles(list)
      })
      .catch((e) => {
        if (alive) setErr(errorText(e))
      })
      .finally(() => {
        if (alive) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [remote.id])

  return (
    <Modal title={`远端文件:${remote.name}`} size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          列出该远端({remote.type}
          {remote.bucket ? ` · ${remote.bucket}` : ''})上的备份文件。
        </p>

        {busy && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner size={16} />
            加载中…
          </div>
        )}

        {!busy && err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        {!busy && !err && files && files.length === 0 && (
          <EmptyState icon={<Cloud />} title="该远端暂无备份文件" hint="上传备份后将在此列出。" />
        )}

        {!busy && !err && files && files.length > 0 && (
          <ul className="divide-y divide-border rounded-(--radius-card) border border-border">
            {files.map((name) => (
              <li
                key={name}
                className="truncate px-4 py-2.5 font-[family-name:var(--font-mono)] text-[13px] text-text"
              >
                {name}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end">
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </Modal>
  )
}
