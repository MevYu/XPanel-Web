import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Tabs } from '../components/Tabs'
import { IconButton } from '../components/IconButton'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import {
  Plus,
  HardDriveDownload,
  ListPlus,
  Cloud,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
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

type Tab = 'records' | 'jobs' | 'remotes'

// 类别切换对齐 aaPanel 顶部 tab;新建/添加是工具栏动作,不进 tab。
const TABS: { key: Tab; label: string }[] = [
  { key: 'records', label: '备份记录' },
  { key: 'jobs', label: '备份任务' },
  { key: 'remotes', label: '远程存储' },
]

const PAGE_SIZES = [10, 20, 50] as const

/** 备份:aaPanel 风格——Tabs(记录/任务/远程存储)+ 工具栏(新建备份/新建任务/添加远程)+ 紧凑表 + 文字操作。全部需 admin。 */
export default function Backup() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [tab, setTab] = useState<Tab>('records')
  const [records, setRecords] = useState<Record[]>([])
  const [remotes, setRemotes] = useState<Remote[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [modal, setModal] = useState<'run' | 'job' | 'target' | null>(null)

  const [recPageSize, setRecPageSize] = useState<number>(PAGE_SIZES[0])
  const [recPage, setRecPage] = useState(0)
  const [jobPageSize, setJobPageSize] = useState<number>(PAGE_SIZES[0])
  const [jobPage, setJobPage] = useState(0)
  const [remotePageSize, setRemotePageSize] = useState<number>(PAGE_SIZES[0])
  const [remotePage, setRemotePage] = useState(0)

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

  async function deleteRemote(r: Remote) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除远端 ${r.name}?`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/backup/remotes/${r.id}`, { method: 'DELETE', headers: DANGER })
      setFeedback({ kind: 'ok', text: `远端 ${r.name} 已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  // 每页条数变化或行数缩减时,把当前页夹回有效范围,避免停在空页。
  const recPageCount = Math.max(1, Math.ceil(records.length / recPageSize))
  useEffect(() => {
    if (recPage > recPageCount - 1) setRecPage(recPageCount - 1)
  }, [recPage, recPageCount])
  const recRows = useMemo(
    () => records.slice(recPage * recPageSize, recPage * recPageSize + recPageSize),
    [records, recPage, recPageSize],
  )

  const jobPageCount = Math.max(1, Math.ceil(jobs.length / jobPageSize))
  useEffect(() => {
    if (jobPage > jobPageCount - 1) setJobPage(jobPageCount - 1)
  }, [jobPage, jobPageCount])
  const jobRows = useMemo(
    () => jobs.slice(jobPage * jobPageSize, jobPage * jobPageSize + jobPageSize),
    [jobs, jobPage, jobPageSize],
  )

  const remotePageCount = Math.max(1, Math.ceil(remotes.length / remotePageSize))
  useEffect(() => {
    if (remotePage > remotePageCount - 1) setRemotePage(remotePageCount - 1)
  }, [remotePage, remotePageCount])
  const remoteRows = useMemo(
    () => remotes.slice(remotePage * remotePageSize, remotePage * remotePageSize + remotePageSize),
    [remotes, remotePage, remotePageSize],
  )

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

  const remoteColumns: Column<Remote>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '名称',
        cell: (r) => <span className="font-medium text-text">{r.name}</span>,
      },
      {
        key: 'type',
        header: '类型',
        width: '90px',
        cell: (r) => <Badge status="neutral">{r.type}</Badge>,
      },
      {
        key: 'bucket',
        header: '桶',
        cell: (r) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {r.bucket || '—'}
          </span>
        ),
      },
      {
        key: 'endpoint',
        header: '端点',
        cell: (r) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {r.endpoint || '—'}
          </span>
        ),
      },
      {
        key: 'secret',
        header: '凭证',
        width: '110px',
        cell: (r) =>
          r.secret_set ? (
            <Badge status="online">已配置</Badge>
          ) : (
            <span className="text-xs text-muted">未配置</span>
          ),
      },
      {
        key: 'created',
        header: '时间',
        width: '150px',
        cell: (r) => <span className="text-xs text-muted">{fmtTime(r.created_at)}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '80px',
        align: 'right',
        cell: (r) => (
          <ActionLinks>
            <ActionLink danger disabled={!isAdmin || busy} onClick={() => void deleteRemote(r)}>
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, busy],
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

  const loadingTable = (
    <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
  )

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

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
          <Cloud size={15} />
          添加远程
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

      {loadErr && records.length === 0 && jobs.length === 0 && remotes.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      {tab === 'records' &&
        (loading ? (
          loadingTable
        ) : (
          <>
            <Table
              columns={recordColumns}
              rows={recRows}
              rowKey={(rec) => rec.id}
              emptyText={
                <EmptyState
                  icon={<HardDriveDownload />}
                  title="暂无备份记录"
                  hint="点击「新建备份」立即执行一次备份。"
                />
              }
            />
            <Pagination
              total={records.length}
              page={recPage}
              pageCount={recPageCount}
              pageSize={recPageSize}
              onPage={setRecPage}
              onPageSize={(n) => {
                setRecPageSize(n)
                setRecPage(0)
              }}
            />
          </>
        ))}

      {tab === 'jobs' &&
        (loading ? (
          loadingTable
        ) : (
          <>
            <Table
              columns={jobColumns}
              rows={jobRows}
              rowKey={(j) => j.id}
              emptyText={
                <EmptyState
                  icon={<ListPlus />}
                  title="还没有备份任务"
                  hint="点击「新建任务」配置定时备份与保留策略。"
                />
              }
            />
            <Pagination
              total={jobs.length}
              page={jobPage}
              pageCount={jobPageCount}
              pageSize={jobPageSize}
              onPage={setJobPage}
              onPageSize={(n) => {
                setJobPageSize(n)
                setJobPage(0)
              }}
            />
          </>
        ))}

      {tab === 'remotes' &&
        (loading ? (
          loadingTable
        ) : (
          <>
            <Table
              columns={remoteColumns}
              rows={remoteRows}
              rowKey={(r) => r.id}
              emptyText={
                <EmptyState
                  icon={<Cloud />}
                  title="还没有远程存储"
                  hint="点击「添加远程」配置 rclone 后端与本地路径。"
                />
              }
            />
            <Pagination
              total={remotes.length}
              page={remotePage}
              pageCount={remotePageCount}
              pageSize={remotePageSize}
              onPage={setRemotePage}
              onPageSize={(n) => {
                setRemotePageSize(n)
                setRemotePage(0)
              }}
            />
          </>
        ))}

      {tab === 'remotes' && (
        <Card>
          <p className="text-xs text-muted">
            「添加远程」弹窗同时管理远端凭证与本地备份目录、mysqldump / pg_dump 工具路径。
          </p>
        </Card>
      )}

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

/** Pagination 表格底部分页:总数 + 每页条数 + 上/下页,对齐 aaPanel 列表底栏与 Sites/Database 页风格。 */
function Pagination({
  total,
  page,
  pageCount,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number
  page: number
  pageCount: number
  pageSize: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
}) {
  if (total === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
      <span className="tabular-nums">共 {total} 条</span>
      <select
        value={pageSize}
        onChange={(e) => onPageSize(Number(e.target.value))}
        aria-label="每页条数"
        className="h-8 rounded-(--radius-sm) border border-border bg-surface-2 px-2 text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n} 条/页
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <IconButton
          aria-label="上一页"
          className="h-8 w-8"
          disabled={page === 0}
          icon={<ChevronLeft size={16} />}
          onClick={() => onPage(Math.max(0, page - 1))}
        />
        <span className="tabular-nums px-1">
          {page + 1} / {pageCount}
        </span>
        <IconButton
          aria-label="下一页"
          className="h-8 w-8"
          disabled={page >= pageCount - 1}
          icon={<ChevronRight size={16} />}
          onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
        />
      </div>
    </div>
  )
}
