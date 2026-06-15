import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

function fmtTime(unix: number | null): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

function fmtSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const TARGET_KINDS = [
  { value: 'path', label: '目录 (path)' },
  { value: 'mysql', label: 'MySQL 库 (mysql)' },
  { value: 'postgres', label: 'PostgreSQL 库 (postgres)' },
] as const
type TargetKind = (typeof TARGET_KINDS)[number]['value']

interface Remote {
  id: number
  name: string
  type: string
  bucket: string
  endpoint: string
  region: string
  access_key: string
  secret_set: boolean
  created_at: number
}

interface Job {
  id: number
  name: string
  target_kind: string
  target: string
  remote_id: number | null
  frequency: string
  keep: number
  created_at: number
}

interface Record {
  id: number
  job_id: number | null
  target_kind: string
  target: string
  filename: string
  location: string
  remote_id: number | null
  size: number
  created_at: number
}

interface RunForm {
  target_kind: TargetKind
  target: string
  remote_id: string
}

interface RemoteForm {
  name: string
  type: string
  bucket: string
  endpoint: string
  region: string
  access_key: string
  secret: string
}

interface JobForm {
  name: string
  target_kind: TargetKind
  target: string
  remote_id: string
  frequency: string
  keep: string
}

const emptyRun: RunForm = { target_kind: 'path', target: '', remote_id: '' }
const emptyRemote: RemoteForm = {
  name: '',
  type: 's3',
  bucket: '',
  endpoint: '',
  region: '',
  access_key: '',
  secret: '',
}
const emptyJob: JobForm = {
  name: '',
  target_kind: 'path',
  target: '',
  remote_id: '',
  frequency: 'daily',
  keep: '7',
}

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

function parseRemoteId(v: string): number | null {
  const n = Number(v)
  return v !== '' && Number.isInteger(n) ? n : null
}

/** 备份:立即备份、备份记录(恢复/删除走危险确认)、远端存储、备份任务与保留策略、目录设置。全部需 admin。 */
export default function Backup() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [records, setRecords] = useState<Record[]>([])
  const [remotes, setRemotes] = useState<Remote[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [settings, setSettings] = useState<{ backup_dir: string; mysqldump: string; pgdump: string } | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [runForm, setRunForm] = useState<RunForm>(emptyRun)
  const [remoteForm, setRemoteForm] = useState<RemoteForm>(emptyRemote)
  const [jobForm, setJobForm] = useState<JobForm>(emptyJob)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [rec, rem, jb, st] = await Promise.all([
        apiFetch<Record[]>('/api/m/backup/records'),
        apiFetch<Remote[]>('/api/m/backup/remotes'),
        apiFetch<Job[]>('/api/m/backup/jobs'),
        apiFetch<{ backup_dir: string; mysqldump: string; pgdump: string }>('/api/m/backup/settings'),
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

  const remoteName = (id: number | null): string => {
    if (id === null) return '本地'
    return remotes.find((r) => r.id === id)?.name ?? `远端 #${id}`
  }

  async function runBackup() {
    if (runForm.target.trim().length === 0 || busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/backup/run', {
        method: 'POST',
        body: JSON.stringify({
          target_kind: runForm.target_kind,
          target: runForm.target.trim(),
          remote_id: parseRemoteId(runForm.remote_id),
        }),
      })
      setFeedback({ kind: 'ok', text: '备份已完成' })
      setRunForm(emptyRun)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

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

  async function addRemote() {
    if (remoteForm.name.trim().length === 0 || remoteForm.type.trim().length === 0 || busy || !isAdmin)
      return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/backup/remotes', {
        method: 'POST',
        body: JSON.stringify({
          name: remoteForm.name.trim(),
          type: remoteForm.type.trim(),
          bucket: remoteForm.bucket.trim(),
          endpoint: remoteForm.endpoint.trim(),
          region: remoteForm.region.trim(),
          access_key: remoteForm.access_key.trim(),
          secret: remoteForm.secret,
        }),
      })
      setFeedback({ kind: 'ok', text: `远端 ${remoteForm.name} 已添加` })
      setRemoteForm(emptyRemote)
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
      await apiFetch(`/api/m/backup/remotes/${r.id}`, { method: 'DELETE' })
      setFeedback({ kind: 'ok', text: `远端 ${r.name} 已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function addJob() {
    const keep = Number(jobForm.keep)
    if (
      jobForm.name.trim().length === 0 ||
      jobForm.target.trim().length === 0 ||
      !Number.isInteger(keep) ||
      keep < 0 ||
      busy ||
      !isAdmin
    )
      return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/backup/jobs', {
        method: 'POST',
        body: JSON.stringify({
          name: jobForm.name.trim(),
          target_kind: jobForm.target_kind,
          target: jobForm.target.trim(),
          remote_id: parseRemoteId(jobForm.remote_id),
          frequency: jobForm.frequency.trim(),
          keep,
        }),
      })
      setFeedback({ kind: 'ok', text: `任务 ${jobForm.name} 已创建` })
      setJobForm(emptyJob)
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

  async function saveSettings() {
    if (!settings || busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<{ backup_dir: string; mysqldump: string; pgdump: string }>(
        '/api/m/backup/settings',
        { method: 'PUT', body: JSON.stringify(settings) },
      )
      setSettings(res)
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">立即备份</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">备份目标类型</span>
            <select
              value={runForm.target_kind}
              onChange={(e) => setRunForm((f) => ({ ...f, target_kind: e.target.value as TargetKind }))}
              className={fieldClass}
            >
              {TARGET_KINDS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label={runForm.target_kind === 'path' ? '目录路径' : '数据库名'}
            placeholder={runForm.target_kind === 'path' ? '/var/www/site' : 'mydb'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-[family-name:var(--font-mono)]"
            value={runForm.target}
            onChange={(e) => setRunForm((f) => ({ ...f, target: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">存储位置</span>
            <select
              value={runForm.remote_id}
              onChange={(e) => setRunForm((f) => ({ ...f, remote_id: e.target.value }))}
              className={fieldClass}
            >
              <option value="">本地</option>
              {remotes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void runBackup()}
            disabled={runForm.target.trim().length === 0 || busy || !isAdmin}
          >
            立即备份
          </Button>
          {busy && <Spinner size={16} />}
        </div>
        {!isAdmin && <p className="text-xs text-muted">备份相关操作需要 admin 角色。</p>}
        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">备份记录</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && records.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">{loadErr}</p>
        ) : records.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">暂无备份记录。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {records.map((rec) => (
              <div key={rec.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-[family-name:var(--font-mono)] text-sm text-text">
                      {rec.filename}
                    </span>
                    <Badge status={rec.location === 'remote' ? 'neutral' : 'online'}>
                      {rec.location === 'remote' ? remoteName(rec.remote_id) : '本地'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{rec.target_kind}</span>
                    <span className="font-[family-name:var(--font-mono)]">{rec.target}</span>
                    <span>{fmtSize(rec.size)}</span>
                    <span>{fmtTime(rec.created_at)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void restore(rec)}
                    disabled={!isAdmin || rec.target_kind !== 'path'}
                    title={rec.target_kind !== 'path' ? '仅目录备份可恢复' : undefined}
                  >
                    恢复
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void deleteRecord(rec)}
                    disabled={!isAdmin}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">远端存储</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="名称"
            placeholder="字母数字 _ -"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={remoteForm.name}
            onChange={(e) => setRemoteForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="类型 (rclone backend)"
            placeholder="s3 / oss / b2"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={remoteForm.type}
            onChange={(e) => setRemoteForm((f) => ({ ...f, type: e.target.value }))}
          />
          <Input
            label="桶 (bucket)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={remoteForm.bucket}
            onChange={(e) => setRemoteForm((f) => ({ ...f, bucket: e.target.value }))}
          />
          <Input
            label="端点 (endpoint)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={remoteForm.endpoint}
            onChange={(e) => setRemoteForm((f) => ({ ...f, endpoint: e.target.value }))}
          />
          <Input
            label="区域 (region)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={remoteForm.region}
            onChange={(e) => setRemoteForm((f) => ({ ...f, region: e.target.value }))}
          />
          <Input
            label="Access key"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={remoteForm.access_key}
            onChange={(e) => setRemoteForm((f) => ({ ...f, access_key: e.target.value }))}
          />
          <Input
            label="Secret(只写)"
            type="password"
            autoComplete="off"
            placeholder="凭证密钥"
            value={remoteForm.secret}
            onChange={(e) => setRemoteForm((f) => ({ ...f, secret: e.target.value }))}
          />
        </div>
        <div>
          <Button
            onClick={() => void addRemote()}
            disabled={remoteForm.name.trim().length === 0 || remoteForm.type.trim().length === 0 || busy || !isAdmin}
          >
            添加远端
          </Button>
        </div>
        {remotes.length > 0 && (
          <div className="divide-y divide-border rounded-(--radius-card) border border-border">
            {remotes.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-4 py-2.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm font-medium text-text">{r.name}</span>
                  <Badge status="neutral">{r.type}</Badge>
                  {r.secret_set && <Badge status="online">凭证已配置</Badge>}
                  <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                    {r.bucket}
                  </span>
                </div>
                <Button size="sm" variant="danger" onClick={() => void deleteRemote(r)} disabled={!isAdmin}>
                  删除
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">备份任务与保留策略</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="任务名称"
            value={jobForm.name}
            onChange={(e) => setJobForm((f) => ({ ...f, name: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">目标类型</span>
            <select
              value={jobForm.target_kind}
              onChange={(e) => setJobForm((f) => ({ ...f, target_kind: e.target.value as TargetKind }))}
              className={fieldClass}
            >
              {TARGET_KINDS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label={jobForm.target_kind === 'path' ? '目录路径' : '数据库名'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-[family-name:var(--font-mono)]"
            value={jobForm.target}
            onChange={(e) => setJobForm((f) => ({ ...f, target: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">存储位置</span>
            <select
              value={jobForm.remote_id}
              onChange={(e) => setJobForm((f) => ({ ...f, remote_id: e.target.value }))}
              className={fieldClass}
            >
              <option value="">本地</option>
              {remotes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="频率 (frequency)"
            placeholder="daily / weekly"
            spellCheck={false}
            value={jobForm.frequency}
            onChange={(e) => setJobForm((f) => ({ ...f, frequency: e.target.value }))}
          />
          <Input
            label="保留份数 (keep,0 不清理)"
            inputMode="numeric"
            value={jobForm.keep}
            onChange={(e) => setJobForm((f) => ({ ...f, keep: e.target.value }))}
          />
        </div>
        <div>
          <Button
            onClick={() => void addJob()}
            disabled={jobForm.name.trim().length === 0 || jobForm.target.trim().length === 0 || busy || !isAdmin}
          >
            创建任务
          </Button>
        </div>
        {jobs.length > 0 && (
          <div className="divide-y divide-border rounded-(--radius-card) border border-border">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-4 px-4 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-medium text-text">{j.name}</span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{j.target_kind}</span>
                    <span className="font-[family-name:var(--font-mono)]">{j.target}</span>
                    <span>{remoteName(j.remote_id)}</span>
                    <span>{j.frequency || '—'}</span>
                    <span>保留 {j.keep}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => void pruneJob(j)} disabled={!isAdmin}>
                    清理过期
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void deleteJob(j)} disabled={!isAdmin}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {settings && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">设置</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="备份目录 (backup_dir)"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={settings.backup_dir}
              onChange={(e) => setSettings((s) => (s ? { ...s, backup_dir: e.target.value } : s))}
            />
            <Input
              label="mysqldump 路径"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={settings.mysqldump}
              onChange={(e) => setSettings((s) => (s ? { ...s, mysqldump: e.target.value } : s))}
            />
            <Input
              label="pg_dump 路径"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={settings.pgdump}
              onChange={(e) => setSettings((s) => (s ? { ...s, pgdump: e.target.value } : s))}
            />
          </div>
          <div>
            <Button onClick={() => void saveSettings()} disabled={busy || !isAdmin}>
              保存设置
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
