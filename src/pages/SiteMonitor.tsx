import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { Stat } from '../components/Stat'
import type { StatusSlice, TrendPoint } from './SiteMonitorCharts'

const SiteMonitorCharts = lazy(() => import('./SiteMonitorCharts'))

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

interface StatusBuckets {
  '2xx': number
  '3xx': number
  '4xx': number
  '5xx': number
  other: number
}

interface SiteStat {
  host: string
  requests: number
  bytes: number
}

interface Count {
  key: string
  count: number
}

interface Report {
  total_requests: number
  total_bytes: number
  unique_ips: number
  status: StatusBuckets
  sites: SiteStat[]
  top_urls: Count[]
  top_ips: Count[]
  top_uas: Count[]
}

interface Settings {
  log_root: string
  access_log: string
  max_lines: number
}

type TopKind = 'url' | 'ip' | 'ua'

const RANGES: { label: string; hours: number; granularity: 'hour' | 'day' }[] = [
  { label: '近 1 小时', hours: 1, granularity: 'hour' },
  { label: '近 24 小时', hours: 24, granularity: 'hour' },
  { label: '近 7 天', hours: 24 * 7, granularity: 'day' },
]

const STATUS_COLORS: Record<keyof StatusBuckets, string> = {
  '2xx': '#34d399',
  '3xx': '#60a5fa',
  '4xx': '#fbbf24',
  '5xx': '#f87171',
  other: '#9ca3af',
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

/** 网站监控:概览/站点统计/趋势/Top 列表 + 时间范围;设置(日志路径)限 admin。 */
export default function SiteMonitor() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [rangeIdx, setRangeIdx] = useState(1)
  const [report, setReport] = useState<Report | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [topKind, setTopKind] = useState<TopKind>('url')
  const [top, setTop] = useState<Count[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    const r = RANGES[rangeIdx]
    const from = Math.floor(Date.now() / 1000) - r.hours * 3600
    const q = `from=${from}&top=10`
    try {
      const [rep, tr, tp] = await Promise.all([
        apiFetch<Report>(`/api/m/sitemonitor/overview?${q}`),
        apiFetch<TrendPoint[]>(`/api/m/sitemonitor/trend?${q}&granularity=${r.granularity}`),
        apiFetch<Count[]>(`/api/m/sitemonitor/top?${q}&kind=${topKind}`),
      ])
      setReport(rep)
      setTrend(tr ?? [])
      setTop(tp ?? [])
      if (isAdmin && !settings) {
        setSettings(await apiFetch<Settings>('/api/m/sitemonitor/settings'))
      }
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
    // settings 仅首次取,故不入依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeIdx, topKind, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  async function saveSettings() {
    if (!settings || busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<Settings>('/api/m/sitemonitor/settings', {
        method: 'PUT',
        body: JSON.stringify({ ...settings, max_lines: Number(settings.max_lines) || 0 }),
      })
      setSettings(res)
      setFeedback({ kind: 'ok', text: '设置已保存' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const statusSlices: StatusSlice[] = report
    ? (Object.keys(STATUS_COLORS) as (keyof StatusBuckets)[]).map((k) => ({
        name: k,
        value: report.status[k],
        color: STATUS_COLORS[k],
      }))
    : []

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r, i) => (
            <Button
              key={r.label}
              size="sm"
              variant={i === rangeIdx ? 'primary' : 'ghost'}
              onClick={() => setRangeIdx(i)}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          刷新
        </Button>
      </Card>

      {loading && !report ? (
        <Card className="flex h-40 items-center justify-center">
          <Spinner size={24} />
        </Card>
      ) : loadErr && !report ? (
        <Card>
          <p className="text-sm text-muted">{loadErr}</p>
        </Card>
      ) : report ? (
        <>
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat value={report.total_requests.toLocaleString()} label="请求数" />
            <Stat value={fmtBytes(report.total_bytes)} label="带宽" />
            <Stat value={report.unique_ips.toLocaleString()} label="独立 IP (UV)" />
            <Stat
              value={
                report.total_requests > 0
                  ? `${Math.round(
                      ((report.status['4xx'] + report.status['5xx']) / report.total_requests) * 100,
                    )}%`
                  : '0%'
              }
              label="错误率 (4xx+5xx)"
            />
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-text">趋势与状态码分布</h2>
            <Suspense
              fallback={
                <div className="flex h-64 items-center justify-center">
                  <Spinner size={24} />
                </div>
              }
            >
              <SiteMonitorCharts trend={trend} status={statusSlices} />
            </Suspense>
          </Card>

          <Card className="p-0">
            <div className="px-5 py-3 text-sm font-medium text-text">按站点统计</div>
            {report.sites.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-muted">暂无数据。</p>
            ) : (
              <div className="divide-y divide-border border-t border-border">
                {report.sites.map((s) => (
                  <div
                    key={s.host}
                    className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                  >
                    <span className="truncate font-[family-name:var(--font-mono)] text-text">
                      {s.host || '(无 host)'}
                    </span>
                    <div className="flex shrink-0 items-center gap-4 text-muted">
                      <span>{s.requests.toLocaleString()} 请求</span>
                      <span>{fmtBytes(s.bytes)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-0">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-medium text-text">Top 排行</span>
              <div className="flex gap-1">
                {(['url', 'ip', 'ua'] as TopKind[]).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={k === topKind ? 'primary' : 'ghost'}
                    onClick={() => setTopKind(k)}
                  >
                    {k.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            {top.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-muted">暂无数据。</p>
            ) : (
              <div className="divide-y divide-border border-t border-border">
                {top.map((c, i) => (
                  <div
                    key={`${c.key}-${i}`}
                    className="flex items-center gap-3 px-5 py-2.5 text-sm"
                  >
                    <Badge status="neutral">{i + 1}</Badge>
                    <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-muted">
                      {c.key}
                    </span>
                    <span className="shrink-0 tabular-nums text-text">
                      {c.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : null}

      {isAdmin && settings && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">设置(日志路径)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="日志根目录 (log_root)"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={settings.log_root}
              onChange={(e) => setSettings((s) => (s ? { ...s, log_root: e.target.value } : s))}
            />
            <Input
              label="默认访问日志 (access_log)"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={settings.access_log}
              onChange={(e) => setSettings((s) => (s ? { ...s, access_log: e.target.value } : s))}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">尾部读取行数上限 (max_lines)</span>
              <input
                className={fieldClass}
                inputMode="numeric"
                value={settings.max_lines}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, max_lines: Number(e.target.value.replace(/\D/g, '')) || 0 } : s,
                  )
                }
              />
            </label>
          </div>
          <div>
            <Button onClick={() => void saveSettings()} disabled={busy}>
              保存设置
            </Button>
          </div>
        </Card>
      )}

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}
