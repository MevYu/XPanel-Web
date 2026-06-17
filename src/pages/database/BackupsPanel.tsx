import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/Button'
import { Badge } from '../../components/Badge'
import { Table, ActionLink, ActionLinks, type Column } from '../../components/Table'
import { RotateCw } from 'lucide-react'
import { type Backup, DANGER, errorText, formatSize, formatDate, downloadBlob } from './shared'

/** BackupsPanel 备份记录:库级备份列表(紧凑 Table),支持下载 / 恢复 / 删除。 */
export function BackupsPanel({ refreshKey }: { refreshKey: number }) {
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    setLoading(true)
    try {
      const data = await apiFetch<Backup[]>('/api/m/database/backups')
      setBackups(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true)
    setFeedback(null)
    try {
      await fn()
      setFeedback({ kind: 'ok', text: `${label}成功` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function restore(b: Backup) {
    if (!window.confirm(`确认用备份「${b.filename}」恢复数据库「${b.db_name}」?现有数据将被覆盖,不可恢复。`)) return
    void run('恢复', () =>
      apiFetch(`/api/m/database/backups/${encodeURIComponent(b.id)}/restore`, { method: 'POST', headers: DANGER }),
    )
  }

  function remove(b: Backup) {
    if (!window.confirm(`确认删除备份「${b.filename}」?此操作不可恢复。`)) return
    void run('删除备份', () =>
      apiFetch(`/api/m/database/backups/${encodeURIComponent(b.id)}`, { method: 'DELETE', headers: DANGER }),
    )
  }

  async function download(b: Backup) {
    setFeedback(null)
    try {
      await downloadBlob(`/api/m/database/backups/${encodeURIComponent(b.id)}/download`, b.filename)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  const columns: Column<Backup>[] = [
    {
      key: 'engine',
      header: '引擎',
      width: '100px',
      cell: (b) => <Badge status="neutral">{b.engine}</Badge>,
    },
    {
      key: 'db',
      header: '数据库',
      cell: (b) => <span className="truncate font-[family-name:var(--font-mono)] text-text">{b.db_name}</span>,
    },
    {
      key: 'file',
      header: '文件',
      cell: (b) => (
        <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{b.filename}</span>
      ),
    },
    {
      key: 'size',
      header: '大小',
      width: '100px',
      align: 'right',
      cell: (b) => <span className="text-muted">{formatSize(b.size)}</span>,
    },
    {
      key: 'created',
      header: '创建时间',
      width: '180px',
      cell: (b) => <span className="text-xs text-muted">{formatDate(b.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '操作',
      width: '170px',
      align: 'right',
      cell: (b) => (
        <ActionLinks>
          <ActionLink onClick={() => void download(b)}>下载</ActionLink>
          <ActionLink onClick={() => restore(b)} disabled={busy}>
            恢复
          </ActionLink>
          <ActionLink danger onClick={() => remove(b)} disabled={busy} aria-label="删除备份">
            删除
          </ActionLink>
        </ActionLinks>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-text">备份记录</h3>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RotateCw size={14} />
          刷新
        </Button>
      </div>

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{feedback.text}</p>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : loadErr ? (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      ) : (
        <Table
          columns={columns}
          rows={backups}
          rowKey={(b) => b.id}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">暂无备份</span>
              <span className="text-xs text-muted">
                在 MySQL / PostgreSQL 标签的库列表中点击「备份」即可创建。
              </span>
            </span>
          }
        />
      )}
    </div>
  )
}
