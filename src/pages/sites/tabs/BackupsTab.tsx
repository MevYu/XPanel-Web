import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Button } from '../../../components/Button'
import { Spinner } from '../../../components/Spinner'
import { Download, RotateCcw, Trash2, Archive } from 'lucide-react'
import { formatBytes } from '../../../lib/format'
import { type Site, type Backup, DANGER, errorText, formatTime, download } from '../shared'
import { Feedback, TabLoading, useTabResource } from '../tabui'

/** BackupsTab 备份:列表 + 立即备份 + 下载 / 恢复(admin 危险)/ 删除(admin 危险)。 */
export function BackupsTab({
  site,
  isAdmin,
}: {
  site: Site
  isAdmin: boolean
}) {
  const base = `/api/m/sites/sites/${site.id}/backups`
  const { data, loading, reload } = useTabResource<Backup[]>(base, [])
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (loading) return <TabLoading />

  // 新→旧
  const rows = [...data].sort((a, b) => b.created_at - a.created_at)

  async function create() {
    setBusy(true)
    setMsg(null)
    try {
      await apiFetch<Backup>(base, { method: 'POST' })
      await reload()
      setMsg({ kind: 'ok', text: '备份已创建' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function doDownload(b: Backup) {
    setMsg(null)
    try {
      await download(`${base}/${b.id}/download`, b.filename)
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    }
  }

  async function restore(b: Backup) {
    if (!isAdmin) return
    if (!window.confirm(`确认用备份「${b.filename}」恢复站点?当前站点文件将被覆盖,此操作危险。`)) return
    setRowBusy(b.id)
    setMsg(null)
    try {
      await apiFetch(`${base}/${b.id}/restore`, { method: 'POST', headers: DANGER })
      setMsg({ kind: 'ok', text: '已从备份恢复' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setRowBusy(null)
    }
  }

  async function remove(b: Backup) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除备份「${b.filename}」?此操作不可恢复。`)) return
    setRowBusy(b.id)
    setMsg(null)
    try {
      await apiFetch(`${base}/${b.id}`, { method: 'DELETE', headers: DANGER })
      await reload()
      setMsg({ kind: 'ok', text: '备份已删除' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setRowBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          打包站点根目录与配置。恢复 / 删除需要 admin 角色。
        </p>
        <Button size="sm" onClick={() => void create()} disabled={busy}>
          {busy ? <Spinner size={14} /> : <Archive size={14} />}
          立即备份
        </Button>
      </div>

      <Feedback msg={msg} />

      {rows.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-(--radius-card) border border-dashed border-border text-sm text-muted">
          <Archive size={22} />
          还没有备份。
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border border-border bg-surface p-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">
                  {b.filename}
                </span>
                <span className="text-xs text-muted">
                  {formatBytes(b.size)} · {formatTime(b.created_at)}
                  {b.created_by != null && ` · 用户 #${b.created_by}`}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {rowBusy === b.id && <Spinner size={14} />}
                <button
                  onClick={() => void doDownload(b)}
                  aria-label="下载"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-surface-2 hover:text-text"
                >
                  <Download size={15} />
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => void restore(b)}
                      disabled={rowBusy != null}
                      aria-label="恢复"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-warn/10 hover:text-warn disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      onClick={() => void remove(b)}
                      disabled={rowBusy != null}
                      aria-label="删除"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-crit/10 hover:text-crit disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
