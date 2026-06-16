import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'
import { Badge } from '../components/Badge'
import type {
  CronJob,
  CronJobType,
  CronPayload,
  CronRun,
  CronSchedule,
  CronScheduleKind,
} from '../api/types'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function fmtTime(unix: number | null): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

const selectClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
const textareaClass =
  'rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60'

// url 暂留(后端支持);backup_site/backup_db 不进 UI。
const TYPE_OPTIONS: { value: CronJobType; label: string }[] = [
  { value: 'command', label: '执行命令' },
  { value: 'shell', label: 'shell 脚本' },
  { value: 'release_mem', label: '释放内存' },
  { value: 'log_cut', label: '日志切割' },
  { value: 'url', label: '访问 URL' },
]

const TYPE_LABEL: Record<CronJobType, string> = {
  command: '执行命令',
  shell: 'shell 脚本',
  release_mem: '释放内存',
  log_cut: '日志切割',
  url: '访问 URL',
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <Card
        className="flex max-h-[80vh] w-full max-w-3xl flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-medium text-text">
            执行日志 · {job.comment || TYPE_LABEL[job.type]}
          </h3>
          <Button size="sm" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        {err ? (
          <p className="text-sm text-crit">{err}</p>
        ) : runs === null ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted">暂无执行记录。</p>
        ) : (
          <div className="flex max-h-[64vh] flex-col gap-3 overflow-auto">
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
      </Card>
    </div>
  )
}

/** Cron 定时任务:任务类型 + 友好调度选择器 + 执行日志,启停/立即执行/编辑/删除。 */
export default function Cron() {
  const { role } = useAuth()
  const readonly = role === 'readonly'
  const isAdmin = role === 'admin'

  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
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

  const canSubmit =
    !busy && !readonly && scheduleReady(form.schedule) && payloadReady(form.type, form.payload)

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
    setFormErr(null)
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
      setForm(emptyForm)
      await load()
    } catch (e) {
      setFormErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

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
      if (form.id === job.id) setForm(emptyForm)
      await load()
    } catch (e) {
      setLoadErr(errorText(e))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">
          {form.id === null ? '新建任务' : `编辑任务 #${form.id}`}
        </h2>

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

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {form.id === null ? '新建' : '保存'}
          </Button>
          {form.id !== null && (
            <Button variant="ghost" onClick={() => setForm(emptyForm)} disabled={busy}>
              取消
            </Button>
          )}
          {busy && <Spinner size={16} />}
        </div>
        {readonly && (
          <p className="text-xs text-muted">当前角色为只读,写操作需要 operator 角色。</p>
        )}
        {formErr && <p className="text-sm text-crit">{formErr}</p>}
      </Card>

      <Card className="p-0">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && jobs.length === 0 ? (
          <p className="p-5 text-sm text-muted">{loadErr}</p>
        ) : jobs.length === 0 ? (
          <p className="p-5 text-sm text-muted">暂无定时任务。</p>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">
                      {job.comment || TYPE_LABEL[job.type]}
                    </span>
                    <Badge status="neutral">{TYPE_LABEL[job.type]}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="font-[family-name:var(--font-mono)]">
                      {describeSchedule(job.expr)}
                    </span>
                    <span>
                      上次执行 {fmtTime(job.last_run_at)}
                      {job.last_result ? ` · ${job.last_result}` : ''}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={job.enabled}
                    onChange={(next) => void toggle(job, next)}
                    disabled={readonly}
                    aria-label={`${job.enabled ? '停用' : '启用'} 任务 ${job.id}`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setForm(jobToForm(job))}
                    disabled={readonly}
                  >
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void runNow(job)}
                    disabled={readonly || runningId === job.id}
                  >
                    {runningId === job.id ? '执行中' : '立即执行'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRunsJob(job)}>
                    执行日志
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void remove(job)}
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

      {runsJob && <RunsModal job={runsJob} onClose={() => setRunsJob(null)} />}
    </div>
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
  return <p className="text-xs text-muted">释放系统缓存内存,无需额外参数。</p>
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
