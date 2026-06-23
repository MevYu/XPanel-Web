import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { Plus, Clock, Search } from 'lucide-react'
import type {
  CronJob,
  CronJobType,
  CronPayload,
  CronRun,
  CronSchedule,
  CronScheduleKind,
} from '../api/types'
import { formatTime } from '../lib/formatTime'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function fmtTime(unix: number | null): string {
  return formatTime(unix ?? 0)
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

const selectClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
const textareaClass =
  'rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60'

const TYPE_OPTIONS: { value: CronJobType; label: string }[] = [
  { value: 'command', label: '执行命令' },
  { value: 'shell', label: 'shell 脚本' },
  { value: 'release_mem', label: '释放内存' },
  { value: 'log_cut', label: '日志切割' },
  { value: 'url', label: '访问 URL' },
  { value: 'backup_site', label: '备份站点' },
  { value: 'backup_db', label: '备份数据库' },
]

const TYPE_LABEL: Record<CronJobType, string> = {
  command: '执行命令',
  shell: 'shell 脚本',
  release_mem: '释放内存',
  log_cut: '日志切割',
  url: '访问 URL',
  backup_site: '备份站点',
  backup_db: '备份数据库',
}

const SCHEDULE_OPTIONS: { value: CronScheduleKind; label: string }[] = [
  { value: 'every_n_minutes', label: '每 N 分钟' },
  { value: 'hourly_at', label: '每小时第几分钟' },
  { value: 'daily_at', label: '每天定点' },
  { value: 'weekly_at', label: '每周定点' },
  { value: 'monthly_at', label: '每月定点' },
  { value: 'raw', label: '高级:cron 表达式' },
]

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 把后端持久化的 5 段 cron 表达式可读化。识别常见模式(后端 Schedule.Build 产物
 * 与典型手写表达式),识别不了就原样回显。全程空值保护,绝不抛错。
 */
function describeSchedule(expr: string | undefined | null): string {
  const raw = (expr ?? '').trim()
  if (!raw) return '—'
  const f = raw.split(/\s+/)
  if (f.length !== 5) return raw
  const [min, hour, dom, mon, dow] = f
  const allFree = (...xs: string[]) => xs.every((x) => x === '*')

  // 每 N 分钟: */N * * * *
  const everyMin = /^\*\/(\d+)$/.exec(min)
  if (everyMin && allFree(hour, dom, mon, dow)) return `每 ${everyMin[1]} 分钟`
  // 每小时第 M 分: M * * * *
  if (/^\d+$/.test(min) && allFree(hour, dom, mon, dow)) {
    return Number(min) === 0 ? '每小时' : `每小时第 ${Number(min)} 分`
  }
  // 每天 HH:MM: M H * * *
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && allFree(dom, mon, dow)) {
    return `每天 ${pad2(Number(hour))}:${pad2(Number(min))}`
  }
  // 每周 W 的 HH:MM: M H * * W
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && /^[0-6]$/.test(dow)) {
    return `${WEEKDAYS[Number(dow)]} ${pad2(Number(hour))}:${pad2(Number(min))}`
  }
  // 每月 D 的 HH:MM: M H D * *
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    return `每月 ${Number(dom)} 日 ${pad2(Number(hour))}:${pad2(Number(min))}`
  }
  return raw
}

interface FormState {
  id: number | null
  type: CronJobType
  schedule: CronSchedule
  payload: CronPayload
  comment: string
  enabled: boolean
}

const emptyForm: FormState = {
  id: null,
  type: 'command',
  schedule: { kind: 'daily_at', hour: 0, minute: 0 },
  payload: {},
  comment: '',
  enabled: true,
}

function jobToForm(job: CronJob): FormState {
  // 后端只回 expr,不回结构化 schedule:编辑时落到「高级 cron 表达式」模式并预填 expr。
  return {
    id: job.id,
    type: job.type,
    schedule: { kind: 'raw', expr: job.expr ?? '' },
    payload: { ...job.payload },
    comment: job.comment,
    enabled: job.enabled,
  }
}

function scheduleReady(s: CronSchedule): boolean {
  switch (s.kind) {
    case 'every_n_minutes':
      return s.minute != null && s.minute >= 1 && s.minute <= 59
    case 'hourly_at':
      return s.minute != null && s.minute >= 0 && s.minute <= 59
    case 'daily_at':
      return s.hour != null && s.minute != null
    case 'weekly_at':
      return s.weekday != null && s.hour != null && s.minute != null
    case 'monthly_at':
      return s.day != null && s.day >= 1 && s.day <= 31 && s.hour != null && s.minute != null
    case 'raw':
      return !!s.expr && s.expr.trim().length > 0
  }
}

function payloadReady(type: CronJobType, p: CronPayload): boolean {
  switch (type) {
    case 'command':
      return !!p.command && p.command.trim().length > 0
    case 'shell':
      return !!p.script && p.script.trim().length > 0
    case 'url':
      return !!p.url && p.url.trim().length > 0
    case 'log_cut':
      return !!p.path && p.path.trim().length > 0
    case 'release_mem':
      return true
    case 'backup_site':
      return !!p.target && p.target.trim().length > 0
    case 'backup_db':
      // target 形如 "engine:database",两段都需非空
      return !!p.target && /^[^:]+:[^:]+$/.test(p.target.trim())
  }
}

function RunsModal({ job, onClose }: { job: CronJob; onClose: () => void }) {
  const [runs, setRuns] = useState<CronRun[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch<CronRun[]>(`/api/m/cron/jobs/${job.id}/runs?limit=20`)
      .then((d) => alive && setRuns(d))
      .catch((e) => alive && setErr(errorText(e)))
    return () => {
      alive = false
    }
  }, [job.id])

  return (
    <Modal title={`执行日志 · ${job.comment || TYPE_LABEL[job.type]}`} onClose={onClose} size="lg">
        {err ? (
          <p className="text-sm text-crit">{err}</p>
        ) : runs === null ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted">暂无执行记录。</p>
        ) : (
          <div className="flex flex-col gap-3">
            {runs.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-(--radius-card) border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <Badge status={r.exit_code === 0 ? 'online' : 'crit'}>
                    退出码 {r.exit_code}
                  </Badge>
                  <span>{fmtTime(r.started_at)}</span>
                  <span>耗时 {fmtDuration(r.duration_ms)}</span>
                </div>
                {(r.output || r.err) && (
                  <pre className="max-h-48 overflow-auto rounded-(--radius-card) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed whitespace-pre-wrap text-text">
                    {r.output}
                    {r.err ? (r.output ? '\n' : '') + r.err : ''}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
    </Modal>
  )
}

/** Cron 定时任务:任务列表用紧凑表格,新建/编辑表单收进固定尺寸弹窗,执行日志另起弹窗。 */
export default function Cron() {
  const { role } = useAuth()
  const readonly = role === 'readonly'
  const isAdmin = role === 'admin'

  const [jobs, setJobs] = useState<CronJob[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<FormState | null>(null)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [runsJob, setRunsJob] = useState<CronJob | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setJobs(await apiFetch<CronJob[]>('/api/m/cron/jobs'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter(
      (j) =>
        (j.comment || '').toLowerCase().includes(q) ||
        TYPE_LABEL[j.type].toLowerCase().includes(q),
    )
  }, [jobs, query])

  async function toggle(job: CronJob, next: boolean) {
    if (readonly) return
    try {
      await apiFetch(`/api/m/cron/jobs/${job.id}/${next ? 'enable' : 'disable'}`, {
        method: 'POST',
      })
      await load()
    } catch (e) {
      setLoadErr(errorText(e))
    }
  }

  async function runNow(job: CronJob) {
    if (readonly) return
    setRunningId(job.id)
    try {
      await apiFetch(`/api/m/cron/jobs/${job.id}/run`, { method: 'POST' })
      await load()
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setRunningId(null)
    }
  }

  async function remove(job: CronJob) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除任务「${job.comment || TYPE_LABEL[job.type]}」?`)) return
    try {
      await apiFetch(`/api/m/cron/jobs/${job.id}`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Danger': '1' },
      })
      await load()
    } catch (e) {
      setLoadErr(errorText(e))
    }
  }

  const columns: Column<CronJob>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '任务名',
        cell: (job) => (
          <div className="flex min-w-0 items-center gap-2">
            <Clock size={15} className="shrink-0 text-warn" />
            <span className="truncate font-medium text-text">
              {job.comment || TYPE_LABEL[job.type]}
            </span>
          </div>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '150px',
        cell: (job) => (
          <div className="flex items-center gap-2.5">
            <Switch
              checked={job.enabled}
              onChange={(next) => void toggle(job, next)}
              disabled={readonly}
              aria-label={`${job.enabled ? '停用' : '启用'} 任务 ${job.id}`}
            />
            <Badge status={job.enabled ? 'online' : 'neutral'}>
              {job.enabled ? '运行中' : '已停用'}
            </Badge>
          </div>
        ),
      },
      {
        key: 'type',
        header: '类型',
        width: '96px',
        cell: (job) => <span className="text-muted">{TYPE_LABEL[job.type]}</span>,
      },
      {
        key: 'schedule',
        header: '执行周期',
        width: '160px',
        cell: (job) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
            {describeSchedule(job.expr)}
          </span>
        ),
      },
      {
        key: 'last',
        header: '最近执行',
        width: '210px',
        cell: (job) => (
          <span className="text-xs text-muted">
            {fmtTime(job.last_run_at)}
            {job.last_result ? <span className="text-text/60"> · {job.last_result}</span> : null}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '180px',
        align: 'right',
        cell: (job) => (
          <ActionLinks>
            <ActionLink disabled={readonly || runningId === job.id} onClick={() => void runNow(job)}>
              {runningId === job.id ? '执行中' : '执行'}
            </ActionLink>
            <ActionLink onClick={() => setRunsJob(job)}>日志</ActionLink>
            <ActionLink disabled={readonly} onClick={() => setEditing(jobToForm(job))}>
              编辑
            </ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin}
              aria-label="删除任务"
              title={isAdmin ? '删除任务' : '需要 admin 角色'}
              onClick={() => void remove(job)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, readonly, runningId],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="md" disabled={readonly} onClick={() => setEditing(emptyForm)}>
            <Plus size={15} />
            添加任务
          </Button>
          <Button variant="ghost" size="md" onClick={() => void load()} disabled={loading}>
            刷新
          </Button>
        </div>
        <div className="relative w-56">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索任务名或类型"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
      </div>

      {loadErr && jobs.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      {loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : (
        <Table
          columns={columns}
          rows={filteredJobs}
          rowKey={(job) => job.id}
          emptyText={
            query.trim() ? (
              <EmptyState icon={<Search />} title="没有匹配的任务" hint="换个关键词再试。" />
            ) : (
              <EmptyState
                icon={<Clock />}
                title="还没有定时任务"
                hint="点击「添加任务」创建你的第一个计划任务。"
              />
            )
          }
        />
      )}

      {readonly && (
        <p className="text-xs text-muted">当前角色为只读,写操作需要 operator 角色,删除需要 admin。</p>
      )}

      {editing && (
        <CronFormModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
      {runsJob && <RunsModal job={runsJob} onClose={() => setRunsJob(null)} />}
    </div>
  )
}

/** CronFormModal 新建/编辑任务弹窗:任务类型 + 友好调度选择器 + 按类型展开的 payload 表单。 */
function CronFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: FormState
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const canSubmit = !busy && scheduleReady(form.schedule) && payloadReady(form.type, form.payload)

  function setSchedule(patch: Partial<CronSchedule>) {
    setForm((f) => ({ ...f, schedule: { ...f.schedule, ...patch } }))
  }

  // 切 kind 时重置为该 kind 的默认字段,避免残留无关字段。
  function changeKind(kind: CronScheduleKind) {
    const defaults: Record<CronScheduleKind, CronSchedule> = {
      every_n_minutes: { kind, minute: 5 },
      hourly_at: { kind, minute: 0 },
      daily_at: { kind, hour: 0, minute: 0 },
      weekly_at: { kind, weekday: 1, hour: 0, minute: 0 },
      monthly_at: { kind, day: 1, hour: 0, minute: 0 },
      raw: { kind, expr: '' },
    }
    setForm((f) => ({ ...f, schedule: defaults[kind] }))
  }

  function setPayload(patch: Partial<CronPayload>) {
    setForm((f) => ({ ...f, payload: { ...f.payload, ...patch } }))
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const body = JSON.stringify({
        schedule: form.schedule,
        type: form.type,
        payload: form.payload,
        comment: form.comment,
        enabled: form.enabled,
      })
      if (form.id === null) {
        await apiFetch('/api/m/cron/jobs', { method: 'POST', body })
      } else {
        await apiFetch(`/api/m/cron/jobs/${form.id}`, { method: 'PUT', body })
      }
      onSaved()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={form.id === null ? '添加任务' : `编辑任务 #${form.id}`} onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">任务类型</span>
            <select
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as CronJobType, payload: {} }))
              }
              className={selectClass}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="备注"
            placeholder="可选,任务说明"
            value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
          />
        </div>

        <TypeFields type={form.type} payload={form.payload} onChange={setPayload} />

        <div className="flex flex-col gap-3 rounded-(--radius-card) border border-border p-4">
          <label className="flex flex-col gap-1.5 sm:max-w-xs">
            <span className="text-xs font-medium text-muted">调度方式</span>
            <select
              value={form.schedule.kind}
              onChange={(e) => changeKind(e.target.value as CronScheduleKind)}
              className={selectClass}
            >
              {SCHEDULE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <ScheduleFields schedule={form.schedule} onChange={setSchedule} />
        </div>

        <label className="flex items-center gap-2">
          <Switch
            checked={form.enabled}
            onChange={(next) => setForm((f) => ({ ...f, enabled: next }))}
            aria-label="启用任务"
          />
          <span className="text-sm text-text">启用</span>
        </label>

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            {form.id === null ? '新建' : '保存'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function TypeFields({
  type,
  payload,
  onChange,
}: {
  type: CronJobType
  payload: CronPayload
  onChange: (patch: Partial<CronPayload>) => void
}) {
  if (type === 'command') {
    return (
      <Input
        label="命令"
        placeholder="例如 /usr/bin/backup.sh"
        value={payload.command ?? ''}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="font-[family-name:var(--font-mono)]"
        onChange={(e) => onChange({ command: e.target.value })}
      />
    )
  }
  if (type === 'shell') {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">脚本内容</span>
        <textarea
          value={payload.script ?? ''}
          rows={6}
          spellCheck={false}
          placeholder={'#!/bin/bash\nset -e\n...'}
          onChange={(e) => onChange({ script: e.target.value })}
          className={textareaClass}
        />
      </label>
    )
  }
  if (type === 'url') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="URL"
          placeholder="https://example.com/cron"
          value={payload.url ?? ''}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          onChange={(e) => onChange({ url: e.target.value })}
        />
        <Input
          label="超时(秒)"
          type="number"
          min={1}
          placeholder="30"
          value={payload.timeout ?? ''}
          onChange={(e) =>
            onChange({ timeout: e.target.value === '' ? undefined : Number(e.target.value) })
          }
        />
      </div>
    )
  }
  if (type === 'log_cut') {
    return (
      <Input
        label="日志路径"
        placeholder="/www/wwwlogs/site.log"
        value={payload.path ?? ''}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="font-[family-name:var(--font-mono)]"
        onChange={(e) => onChange({ path: e.target.value })}
      />
    )
  }
  if (type === 'backup_site') {
    return <BackupSiteField target={payload.target ?? ''} onChange={(t) => onChange({ target: t })} />
  }
  if (type === 'backup_db') {
    return <BackupDbField target={payload.target ?? ''} onChange={(t) => onChange({ target: t })} />
  }
  return <p className="text-xs text-muted">释放系统缓存内存,无需额外参数。</p>
}

/** BackupSiteField 备份站点:从「网站」模块拉站点列表,target = 站点名。 */
function BackupSiteField({ target, onChange }: { target: string; onChange: (t: string) => void }) {
  const [sites, setSites] = useState<{ name: string }[]>([])
  useEffect(() => {
    apiFetch<{ name: string }[]>('/api/m/sites/sites')
      .then(setSites)
      .catch(() => setSites([]))
  }, [])
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">站点</span>
      <select className={selectClass} value={target} onChange={(e) => onChange(e.target.value)}>
        <option value="">选择站点…</option>
        {sites.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>
      {sites.length === 0 && <span className="text-xs text-faint">需启用「网站」模块且已有站点。</span>}
    </label>
  )
}

/** BackupDbField 备份数据库:引擎 + 库下拉,target = "engine:database"。 */
function BackupDbField({ target, onChange }: { target: string; onChange: (t: string) => void }) {
  const [engine, db] = target.includes(':') ? target.split(':') : ['mysql', '']
  const eng = engine || 'mysql'
  const [dbs, setDbs] = useState<{ name: string }[]>([])
  useEffect(() => {
    apiFetch<{ name: string }[]>(`/api/m/database/${eng}/databases`)
      .then(setDbs)
      .catch(() => setDbs([]))
  }, [eng])
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">引擎</span>
        <select className={selectClass} value={eng} onChange={(e) => onChange(`${e.target.value}:`)}>
          <option value="mysql">MySQL</option>
          <option value="postgres">PostgreSQL</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">数据库</span>
        <select className={selectClass} value={db} onChange={(e) => onChange(`${eng}:${e.target.value}`)}>
          <option value="">选择数据库…</option>
          {dbs.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
        {dbs.length === 0 && <span className="text-xs text-faint">需启用「数据库」模块。</span>}
      </label>
    </div>
  )
}

function NumField({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number | undefined
  onChange: (n: number | undefined) => void
  min: number
  max: number
  label: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="h-10 w-24 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      />
    </label>
  )
}

function ScheduleFields({
  schedule,
  onChange,
}: {
  schedule: CronSchedule
  onChange: (patch: Partial<CronSchedule>) => void
}) {
  const s = schedule
  if (s.kind === 'every_n_minutes') {
    return (
      <div className="flex flex-wrap gap-3">
        <NumField value={s.minute} onChange={(n) => onChange({ minute: n })} min={1} max={59} label="分钟数 (1-59)" />
      </div>
    )
  }
  if (s.kind === 'hourly_at') {
    return (
      <div className="flex flex-wrap gap-3">
        <NumField value={s.minute} onChange={(n) => onChange({ minute: n })} min={0} max={59} label="第几分钟 (0-59)" />
      </div>
    )
  }
  if (s.kind === 'daily_at') {
    return (
      <div className="flex flex-wrap gap-3">
        <NumField value={s.hour} onChange={(n) => onChange({ hour: n })} min={0} max={23} label="时 (0-23)" />
        <NumField value={s.minute} onChange={(n) => onChange({ minute: n })} min={0} max={59} label="分 (0-59)" />
      </div>
    )
  }
  if (s.kind === 'weekly_at') {
    return (
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">星期</span>
          <select
            value={s.weekday ?? 0}
            onChange={(e) => onChange({ weekday: Number(e.target.value) })}
            className={selectClass}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <NumField value={s.hour} onChange={(n) => onChange({ hour: n })} min={0} max={23} label="时 (0-23)" />
        <NumField value={s.minute} onChange={(n) => onChange({ minute: n })} min={0} max={59} label="分 (0-59)" />
      </div>
    )
  }
  if (s.kind === 'monthly_at') {
    return (
      <div className="flex flex-wrap gap-3">
        <NumField value={s.day} onChange={(n) => onChange({ day: n })} min={1} max={31} label="日 (1-31)" />
        <NumField value={s.hour} onChange={(n) => onChange({ hour: n })} min={0} max={23} label="时 (0-23)" />
        <NumField value={s.minute} onChange={(n) => onChange({ minute: n })} min={0} max={59} label="分 (0-59)" />
      </div>
    )
  }
  return (
    <Input
      label="cron 表达式"
      placeholder="例如 0 3 * * *"
      value={s.expr ?? ''}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      className="font-[family-name:var(--font-mono)]"
      onChange={(e) => onChange({ expr: e.target.value })}
    />
  )
}
