import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { type Project, errorText } from './shared'

/** LogsModal 项目状态 + 日志查看弹窗:固定尺寸,只读,带刷新。 */
export function LogsModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [status, setStatus] = useState('')
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [s, l] = await Promise.all([
      apiFetch<string>(`/api/m/python/projects/${project.id}/status`)
        .then((v) => (typeof v === 'string' ? v : ''))
        .catch((e) => errorText(e)),
      apiFetch<string>(`/api/m/python/projects/${project.id}/logs?tail=200`)
        .then((v) => (typeof v === 'string' ? v : ''))
        .catch((e) => errorText(e)),
    ])
    setStatus(s)
    setLogs(l)
    setLoading(false)
  }, [project.id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Modal title={`日志 · ${project.name}`} size="lg" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            {loading && <Spinner size={14} />}
            刷新
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">状态</span>
          <pre className="overflow-auto rounded-(--radius-card) bg-surface p-3 font-[family-name:var(--font-mono)] text-xs whitespace-pre-wrap text-text">
            {status.trim() || '无状态输出'}
          </pre>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">日志(tail 200)</span>
          <pre className="max-h-80 overflow-auto rounded-(--radius-card) bg-surface p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed whitespace-pre-wrap text-text">
            {logs.trim() || '无日志输出'}
          </pre>
        </div>
      </div>
    </Modal>
  )
}
