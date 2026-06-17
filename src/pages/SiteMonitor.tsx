import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { Stat } from '../components/Stat'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Activity, Globe, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { uid } from '../lib/uid'
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

/** errorRate 全局 4xx+5xx 占比(0..1);无请求时为 0。后端不按站点分桶状态码,只能取全局。 */
function errorRate(s: StatusBuckets, total: number): number {
  if (total <= 0) return 0
  return (s['4xx'] + s['5xx']) / total
}

interface SiteRow extends SiteStat {
  key: string
  display: string
  online: boolean
  state: 'online' | 'warn' | 'crit'
}

/**
 * 网站监控:aaPanel 风格被监控站点表(host 来自 nginx 访问日志聚合)。
 * 后端是只读日志分析,无按站点的上线探测/响应时延/历史可用率,故响应时间列为占位、
 * 可用率取全局错误率反推、状态按「时段内是否有请求」判在线/离线。详情弹窗看真实趋势/状态码图。
 */
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

  const [detailHost, setDetailHost] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
      setSettingsOpen(false)
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

  // 派生可用率:无按站点历史可用率,取全局 4xx+5xx 错误率反推。
  const availPct = report
    ? Math.max(0, 100 - Math.round(errorRate(report.status, report.total_requests) * 100))
    : 100

  // 站点行:时段内有请求 = 在线;全局错误率偏高(>5%)整体标异常(warn)。
  const rows: SiteRow[] = useMemo(() => {
    const sites = report?.sites ?? []
    const degraded = report ? errorRate(report.status, report.total_requests) > 0.05 : false
    return sites.map((s) => {
      const host = s.host && s.host !== '-' ? s.host : '(未知 host)'
      const online = s.requests > 0
      const state: SiteRow['state'] = !online ? 'crit' : degraded ? 'warn' : 'online'
      return { ...s, key: uid(), display: host, online, state }
    })
  }, [report])

  const onlineCount = rows.filter((r) => r.online).length
  const offlineCount = rows.length - onlineCount

  const columns: Column<SiteRow>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '站点',
        cell: (s) => (
          <button
            type="button"
            onClick={() => setDetailHost(s.display)}
            className="inline-flex items-center gap-2 rounded-sm font-medium text-text outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <Globe size={15} className="shrink-0 text-warn" />
            <span className="truncate font-[family-name:var(--font-mono)] text-[13px]">
              {s.display}
            </span>
          </button>
        ),
      },
      {
        key: 'url',
        header: 'URL',
        cell: (s) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {s.display === '(未知 host)' ? '—' : `http://${s.display}/`}
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '92px',
        cell: (s) => (
          <Badge status={s.state}>
            {s.state === 'online' ? '在线' : s.state === 'warn' ? '异常' : '离线'}
          </Badge>
        ),
      },
      {
        key: 'resp',
        header: '响应时间',
        width: '100px',
        align: 'right',
        cell: () => (
          <span className="tabular-nums text-muted" title="后端日志分析未采集响应时延,暂无数据">
            —
          </span>
        ),
      },
      {
        key: 'avail',
        header: '可用率',
        width: '96px',
        align: 'right',
        cell: (s) => (
          <span
            className="tabular-nums text-text"
            title="由全时段 4xx+5xx 错误率反推(后端无按站点历史可用率)"
          >
            {s.online ? `${availPct}%` : '0%'}
          </span>
        ),
      },
      {
        key: 'reqs',
        header: '请求 / 带宽',
        cell: (s) => (
          <span className="text-xs text-muted">
            {s.requests.toLocaleString()} · {fmtBytes(s.bytes)}
          </span>
        ),
      },
      {
        key: 'last',
        header: '最近检测',
        width: '110px',
        cell: (s) => (
          <span className="text-xs text-muted">{s.online ? RANGES[rangeIdx].label : '—'}</span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '140px',
        align: 'right',
        cell: (s) => (
          <ActionLinks>
            <ActionLink onClick={() => setDetailHost(s.display)}>详情</ActionLink>
            <ActionLink
              disabled={!isAdmin}
              title={isAdmin ? '编辑监控设置' : '需要 admin 角色'}
              onClick={() => setSettingsOpen(true)}
            >
              编辑
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, availPct, rangeIdx],
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
            网站监控
          </h1>
          <p className="text-xs text-muted">
            基于 nginx 访问日志的站点可用性与流量概览,详情可查看趋势与状态码分布。
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="md" disabled={!isAdmin} onClick={() => setSettingsOpen(true)}>
            <Plus size={15} />
            添加监控
          </Button>
          <Button
            variant="ghost"
            size="md"
            disabled={!isAdmin}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={15} />
            设置
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-(--radius-sm) border border-border bg-surface p-0.5">
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(i)}
                className={`h-9 rounded-sm px-3 text-[13px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                  i === rangeIdx
                    ? 'bg-surface-2 text-text'
                    : 'text-muted hover:bg-surface-2/60 hover:text-text'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="md" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
            刷新
          </Button>
        </div>
      </div>

      {loadErr && !report && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      {loading && !report ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : report ? (
        <>
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat value={rows.length.toLocaleString()} label="监控站点" />
            <Stat value={onlineCount.toLocaleString()} label="在线" />
            <Stat value={offlineCount.toLocaleString()} label="离线" />
            <Stat value={`${availPct}%`} label="可用率 (派生)" />
          </Card>

          <Table
            columns={columns}
            rows={rows}
            rowKey={(s) => s.key}
            onRowClick={(s) => setDetailHost(s.display)}
            emptyText={
              <span className="flex flex-col items-center gap-1 py-6">
                <Activity size={22} className="text-warn" />
                <span className="text-sm font-medium text-text">还没有监控目标</span>
                <span className="text-xs text-muted">
                  该时段内日志无站点请求记录。点击「添加监控」配置日志路径,或换个时间范围。
                </span>
              </span>
            }
          />

          {!isAdmin && <p className="text-xs text-muted">添加 / 编辑监控配置需要 admin 角色。</p>}
        </>
      ) : null}

      {detailHost && report && (
        <Modal title={`监控详情 · ${detailHost}`} size="lg" onClose={() => setDetailHost(null)}>
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat value={report.total_requests.toLocaleString()} label="请求数" />
              <Stat value={fmtBytes(report.total_bytes)} label="带宽" />
              <Stat value={report.unique_ips.toLocaleString()} label="独立 IP (UV)" />
              <Stat
                value={`${Math.round(errorRate(report.status, report.total_requests) * 100)}%`}
                label="错误率 (4xx+5xx)"
              />
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-text">趋势与状态码分布</h3>
              <Suspense
                fallback={
                  <div className="flex h-64 items-center justify-center">
                    <Spinner size={24} />
                  </div>
                }
              >
                <SiteMonitorCharts trend={trend} status={statusSlices} />
              </Suspense>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-text">Top 排行</h3>
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
                <p className="py-3 text-sm text-muted">暂无数据。</p>
              ) : (
                <div className="divide-y divide-border rounded-(--radius-card) border border-border">
                  {top.map((c) => (
                    <div key={uid()} className="flex items-center gap-3 px-4 py-2 text-sm">
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
            </div>

            <p className="text-xs text-muted">
              注:后端为只读日志分析,响应时延与按站点历史可用率暂未采集,表中相应列为占位或派生值。
            </p>
          </div>
        </Modal>
      )}

      {settingsOpen && isAdmin && settings && (
        <Modal title="监控设置 · 日志路径" size="md" onClose={() => setSettingsOpen(false)}>
          <div className="flex flex-col gap-4">
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
            <p className="text-xs text-muted">
              被监控站点由该日志解析出的 host 自动列出,无需逐站添加。
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
                取消
              </Button>
              <Button onClick={() => void saveSettings()} disabled={busy}>
                {busy && <Spinner size={14} />}
                保存设置
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}
