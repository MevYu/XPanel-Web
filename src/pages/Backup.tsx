import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Plus, HardDriveDownload, ListPlus } from 'lucide-react'
import {
  type Job,
  type Record,
  type Remote,
  type Settings,
  DANGER,
  errorText,
  fmtSize,
  fmtTime,
  kindLabel,
} from './backup/shared'
import { RunBackupModal } from './backup/RunBackupModal'
import { JobModal } from './backup/JobModal'
import { TargetSettingsModal } from './backup/TargetSettingsModal'

/** 备份:aaPanel 布局——工具栏(新建备份/新建任务/目标设置)+ 备份任务表 + 备份记录表。全部需 admin。 */
export default function Backup() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [records, setRecords] = useState<Record[]>([])
  const [remotes, setRemotes] = useState<Remote[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [modal, setModal] = useState<'run' | 'job' | 'target' | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [rec, rem, jb, st] = await Promise.all([
        apiFetch<Record[]>('/api/m/backup/records'),
        apiFetch<Remote[]>('/api/m/backup/remotes'),
        apiFetch<Job[]>('/api/m/backup/jobs'),
        apiFetch<Settings>('/api/m/backup/settings'),
      ])
      setRecords(rec)
      setRemotes(rem)
      setJobs(jb)
      setSettings(st)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const remoteName = useCallback(
    (id: number | null): string => {
      if (id === null) return '本地'
      return remotes.find((r) => r.id === id)?.name ?? `远端 #${id}`
    },
    [remotes],
  )

  async function restore(rec: Record) {
    if (!isAdmin) return
    if (rec.target_kind !== 'path') {
      setFeedback({ kind: 'err', text: '仅支持恢复目录(path)类型备份' })
      return
    }
    const dest = window.prompt('恢复到目标目录(将解压覆盖该目录内容):', rec.target)
    if (dest === null || dest.trim().length === 0) return
    if (!window.confirm(`确认将备份 ${rec.filename} 恢复到 ${dest}?此操作危险且可能覆盖现有文件。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/backup/records/${rec.id}/restore`, {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({ dest: dest.trim() }),
      })
      setFeedback({ kind: 'ok', text: '恢复已完成' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function downloadRecord(rec: Record) {
    // 流式下载需带 Bearer,普通 <a> 不行;raw fetch → blob → 触发下载。
    setBusy(true)
    setFeedback(null)
    try {
      const t = tokenStore.get()
      const res = await fetch(`/api/m/backup/records/${rec.id}/download`, {
        headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
      })
      if (!res.ok) throw new Error((await res.text()).trim() || '下载失败')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = rec.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function deleteRecord(rec: Record) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除备份 ${rec.filename}?此操作危险且不可恢复。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/backup/records/${rec.id}`, { method: 'DELETE', headers: DANGER })
      setFeedback({ kind: 'ok', text: '备份记录已删除' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function deleteJob(j: Job) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除备份任务 ${j.name}?`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/backup/jobs/${j.id}`, { method: 'DELETE' })
      setFeedback({ kind: 'ok', text: `任务 ${j.name} 已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function pruneJob(j: Job) {
    if (!isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<{ removed: number }>(`/api/m/backup/jobs/${j.id}/prune`, {
        method: 'POST',
      })
      setFeedback({ kind: 'ok', text: `任务 ${j.name} 已清理 ${res.removed} 个过期备份` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const jobColumns: Column<Job>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '名称',
        cell: (j) => <span className="font-medium text-text">{j.name}</span>,
      },
      {
        key: 'kind',
        header: '类型',
        width: '110px',
        cell: (j) => <span className="text-muted">{kindLabel[j.target_kind] ?? j.target_kind}</span>,
      },
      {
        key: 'target',
        header: '目标',
        cell: (j) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {j.target}
          </span>
        ),
      },
      {
        key: 'remote',
        header: '存储',
        width: '120px',
        cell: (j) => <span className="text-muted">{remoteName(j.remote_id)}</span>,
      },
      {
        key: 'frequency',
        header: '周期',
        width: '90px',
        cell: (j) => <span className="text-muted">{j.frequency || '—'}</span>,
      },
      {
        key: 'keep',
        header: '保留',
        width: '70px',
        cell: (j) => <span className="text-muted">{j.keep}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '140px',
        align: 'right',
        cell: (j) => (
          <ActionLinks>
            <ActionLink disabled={!isAdmin || busy} onClick={() => void pruneJob(j)}>
              清理过期
            </ActionLink>
            <ActionLink danger disabled={!isAdmin || busy} onClick={() => void deleteJob(j)}>
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, busy, remoteName],
  )

  const recordColumns: Column<Record>[] = useMemo(
    () => [
      {
        key: 'filename',
        header: '名称',
        cell: (rec) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-[13px] text-text">
            {rec.filename}
          </span>
        ),
      },
      {
        key: 'kind',
        header: '类型',
        width: '110px',
        cell: (rec) => (
          <span className="text-muted">{kindLabel[rec.target_kind] ?? rec.target_kind}</span>
        ),
      },
      {
        key: 'target',
        header: '来源',
        cell: (rec) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {rec.target}
          </span>
        ),
      },
      {
        key: 'location',
        header: '存储',
        width: '130px',
        cell: (rec) => (
          <Badge status={rec.location === 'remote' ? 'neutral' : 'online'}>
            {rec.location === 'remote' ? remoteName(rec.remote_id) : '本地'}
          </Badge>
        ),
      },
      {
        key: 'size',
        header: '大小',
        width: '90px',
        cell: (rec) => <span className="text-muted">{fmtSize(rec.size)}</span>,
      },
      {
        key: 'created',
        header: '时间',
        width: '150px',
        cell: (rec) => <span className="text-xs text-muted">{fmtTime(rec.created_at)}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '200px',
        align: 'right',
        cell: (rec) => (
          <ActionLinks>
            <ActionLink
              disabled={busy || rec.location !== 'local'}
              title={rec.location !== 'local' ? '仅本地备份可下载' : undefined}
              onClick={() => void downloadRecord(rec)}
            >
              下载
            </ActionLink>
            <ActionLink
              disabled={!isAdmin || busy || rec.target_kind !== 'path'}
              title={rec.target_kind !== 'path' ? '仅目录备份可恢复' : undefined}
              onClick={() => void restore(rec)}
            >
              恢复
            </ActionLink>
            <ActionLink danger disabled={!isAdmin || busy} onClick={() => void deleteRecord(rec)}>
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, busy, remoteName],
  )

  const closeModal = () => setModal(null)
  const afterRun = () => {
    closeModal()
    setFeedback({ kind: 'ok', text: '备份已完成' })
    void load()
  }
  const afterJob = () => {
    closeModal()
    setFeedback({ kind: 'ok', text: '备份任务已创建' })
    void load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="md" disabled={!isAdmin} onClick={() => setModal('run')}>
          <Plus size={15} />
          新建备份
        </Button>
        <Button variant="ghost" size="md" disabled={!isAdmin} onClick={() => setModal('job')}>
          <ListPlus size={15} />
          新建任务
        </Button>
        <Button variant="ghost" size="md" disabled={!isAdmin} onClick={() => setModal('target')}>
          <HardDriveDownload size={15} />
          备份目标设置
        </Button>
        <Button variant="ghost" size="md" className="ml-auto" onClick={() => void load()} disabled={busy}>
          刷新
        </Button>
      </div>

      {!isAdmin && <p className="text-xs text-muted">备份相关操作需要 admin 角色。</p>}

      {feedback && (
        <p
          className={`rounded-(--radius-card) border px-3 py-2 text-sm ${
            feedback.kind === 'ok'
              ? 'border-online/40 bg-online/10 text-online'
              : 'border-crit/40 bg-crit/10 text-crit'
          }`}
        >
          {feedback.text}
        </p>
      )}

      {loadErr && records.length === 0 && jobs.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-text">备份任务</h2>
        {loading ? (
          <div className="h-32 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
        ) : (
          <Table
            columns={jobColumns}
            rows={jobs}
            rowKey={(j) => j.id}
            emptyText={
              <span className="flex flex-col items-center gap-1 py-6">
                <span className="text-sm font-medium text-text">还没有备份任务</span>
                <span className="text-xs text-muted">点击「新建任务」配置定时备份与保留策略。</span>
              </span>
            }
          />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-text">备份记录</h2>
        {loading ? (
          <div className="h-32 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
        ) : (
          <Table
            columns={recordColumns}
            rows={records}
            rowKey={(rec) => rec.id}
            emptyText={
              <span className="flex flex-col items-center gap-1 py-6">
                <span className="text-sm font-medium text-text">暂无备份记录</span>
                <span className="text-xs text-muted">点击「新建备份」立即执行一次备份。</span>
              </span>
            }
          />
        )}
      </section>

      {modal === 'run' && (
        <RunBackupModal remotes={remotes} onClose={closeModal} onDone={afterRun} />
      )}
      {modal === 'job' && <JobModal remotes={remotes} onClose={closeModal} onDone={afterJob} />}
      {modal === 'target' && (
        <TargetSettingsModal
          remotes={remotes}
          settings={settings}
          onClose={closeModal}
          onChanged={() => void load()}
        />
      )}
    </div>
  )
}
