import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'
import type { CronJob } from '../api/types'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function fmtTime(unix: number | null): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

interface FormState {
  id: number | null
  expr: string
  command: string
  comment: string
}

const emptyForm: FormState = { id: null, expr: '', command: '', comment: '' }

/** Cron 定时任务:列出托管任务,新增/编辑表达式与命令,启停开关,删除。 */
export default function Cron() {
  const { role } = useAuth()
  const readonly = role === 'readonly'

  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const data = await apiFetch<CronJob[]>('/api/m/cron/jobs')
      setJobs(data)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const expr = form.expr.trim()
  const command = form.command.trim()
  const canSubmit = expr.length > 0 && command.length > 0 && !busy && !readonly

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setFormErr(null)
    try {
      const body = JSON.stringify({ expr, command, comment: form.comment })
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

  async function remove(job: CronJob) {
    if (readonly) return
    if (!window.confirm(`确认删除任务「${job.comment || job.command}」?`)) return
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

  function edit(job: CronJob) {
    setForm({ id: job.id, expr: job.expr, command: job.command, comment: job.comment })
    setFormErr(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">
          {form.id === null ? '新增任务' : `编辑任务 #${form.id}`}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Cron 表达式"
            placeholder="例如 0 3 * * *"
            value={form.expr}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-[family-name:var(--font-mono)]"
            onChange={(e) => setForm((f) => ({ ...f, expr: e.target.value }))}
          />
          <Input
            label="备注"
            placeholder="可选,任务说明"
            value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
          />
        </div>
        <Input
          label="命令"
          placeholder="例如 /usr/bin/backup.sh"
          value={form.command}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {form.id === null ? '新增' : '保存'}
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
              <div key={job.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-medium text-text">
                    {job.comment || job.command}
                  </span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-[family-name:var(--font-mono)] text-xs text-muted">
                    <span>{job.expr}</span>
                    <span className="truncate">{job.command}</span>
                  </div>
                  <span className="text-xs text-muted">
                    上次运行 {fmtTime(job.last_run_at)}
                    {job.last_result ? ` · ${job.last_result}` : ''}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Switch
                    checked={job.enabled}
                    onChange={(next) => void toggle(job, next)}
                    disabled={readonly}
                    aria-label={`${job.enabled ? '停用' : '启用'} 任务 ${job.id}`}
                  />
                  <Button size="sm" variant="ghost" onClick={() => edit(job)} disabled={readonly}>
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void remove(job)}
                    disabled={readonly}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
