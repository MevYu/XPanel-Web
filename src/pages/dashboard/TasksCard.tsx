import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { Card } from '../../components/Card'
import { Badge } from '../../components/Badge'
import { useModules } from '../../hooks/useModules'
import { formatTime } from '../../lib/formatTime'
import type { CronJob, CronRun } from '../../api/types'

const SHOW = 6 // 展示的最近执行条数
const RUNS_PER_JOB = 3 // 每个 job 取最近几条参与合并

interface Row extends CronRun {
  jobName: string
}

// cron 无"全局执行记录"端点,只能逐 job 取 runs 再合并;失败的单个 job 跳过,不整卡崩。
async function fetchRecentRuns(): Promise<Row[]> {
  const jobs = await apiFetch<CronJob[]>('/api/m/cron/jobs')
  const lists = await Promise.all(
    jobs.map((j) =>
      apiFetch<CronRun[]>(`/api/m/cron/jobs/${j.id}/runs?limit=${RUNS_PER_JOB}`)
        .then((runs) =>
          runs.map((r) => ({ ...r, jobName: j.comment || `任务 #${j.id}` }) as Row),
        )
        .catch(() => [] as Row[]),
    ),
  )
  return lists
    .flat()
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, SHOW)
}

/** TasksCard 任务面板卡:聚合各 cron job 的最近执行记录,cron 未启用则不出卡。 */
export function TasksCard() {
  const { enabled } = useModules()
  const hasCron = enabled.some((m) => m.id === 'cron')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!hasCron) return
    let alive = true
    fetchRecentRuns()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setErr(true))
    return () => {
      alive = false
    }
  }, [hasCron])

  if (!hasCron) return null

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">任务面板</h3>
        <Link to="/cron" className="text-xs text-muted hover:text-brand">
          查看全部
        </Link>
      </div>
      {err ? (
        <p className="text-sm text-muted">无法获取执行记录,稍后重试。</p>
      ) : rows == null ? (
        <p className="text-sm text-muted">加载中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">暂无执行记录。</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => {
            const ok = r.exit_code === 0
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-text" title={r.jobName}>
                    {r.jobName}
                  </span>
                  <span className="text-xs text-muted">{formatTime(r.started_at)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 font-[family-name:var(--font-mono)] text-xs tabular-nums text-muted">
                  <span>{(r.duration_ms / 1000).toFixed(1)}s</span>
                  <Badge status={ok ? 'online' : 'crit'}>
                    {ok ? '成功' : `退出 ${r.exit_code}`}
                  </Badge>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
