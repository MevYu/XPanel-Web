import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'
import { Stat } from '../components/Stat'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Activity, Globe, Plus, RefreshCw, BarChart3 } from 'lucide-react'
import { uid } from '../lib/uid'
import type { StatusSlice, TrendPoint } from './SiteMonitorCharts'

const SiteMonitorCharts = lazy(() => import('./SiteMonitorCharts'))

const DANGER = { 'X-Confirm-Danger': '1' }

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

type ProbeStatus = 'up' | 'down' | 'unknown'

interface Target {
  id: number
  name: string
  url: string
  interval_sec: number
  timeout_sec: number
  enabled: boolean
  created_at: number
  last_status: ProbeStatus
  last_code: number
  last_latency_ms: number
  last_checked_at: number
  availability: number
}

interface TargetForm {
  name: string
  url: string
  interval_sec: number
  timeout_sec: number
  enabled: boolean
}

const fieldClass =
  'h-10 rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 text-sm text-text outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] transition-[border-color,box-shadow,background-color] duration-(--dur-micro) ease-(--ease-out) hover:border-border-strong focus:border-brand focus:bg-surface-2 focus:shadow-[0_0_0_3px_var(--color-brand-soft),inset_0_1px_2px_rgba(0,0,0,0.25)]'

const STATUS_META: Record<ProbeStatus, { badge: 'online' | 'crit' | 'neutral'; text: string }> = {
  up: { badge: 'online', text: '在线' },
  down: { badge: 'crit', text: '离线' },
  unknown: { badge: 'neutral', text: '未知' },
}

function fmtLatency(ms: number, status: ProbeStatus): string {
  if (status === 'unknown') return '—'
  return `${ms} ms`
}

function fmtAvailability(a: number): string {
  return `${Math.round(Math.max(0, Math.min(1, a)) * 100)}%`
}

function fmtChecked(ts: number): string {
  if (!ts) return '从未'
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return new Date(ts * 1000).toLocaleString()
}

const EMPTY_FORM: TargetForm = {
  name: '',
  url: '',
  interval_sec: 60,
  timeout_sec: 10,
  enabled: true,
}

/**
 * 网站监控:主动探测被监控目标(HTTP 健康检查),实时显示状态/响应时延/可用率。
 * 原 nginx 访问日志分析降为「流量分析」分区(目标详情内懒加载图表)。
 */
export default function SiteMonitor() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // editing: null=关闭, {id:null}=新建, {id:number}=编辑
  const [editing, setEditing] = useState<{ id: number | null; form: TargetForm } | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [trafficId, setTrafficId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      const list = await apiFetch<Target[]>('/api/m/sitemonitor/targets')
      setTargets(list ?? [])
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function submit() {
    if (!editing || busy || !canWrite) return
    const form = editing.form
    const name = form.name.trim()
    const url = form.url.trim()
    if (!name) {
      setFormErr('请填写名称')
      return
    }
    if (!/^https?:\/\/.+/i.test(url)) {
      setFormErr('请填写有效的 http(s) URL')
      return
    }
    const interval = Math.max(1, Math.floor(form.interval_sec) || 0)
    const timeout = Math.max(1, Math.floor(form.timeout_sec) || 0)
    setBusy(true)
    setFormErr(null)
    setFeedback(null)
    const body = JSON.stringify({
      name,
      url,
      interval_sec: interval,
      timeout_sec: timeout,
      enabled: form.enabled,
    })
    try {
      if (editing.id == null) {
        await apiFetch('/api/m/sitemonitor/targets', { method: 'POST', body })
      } else {
        await apiFetch(`/api/m/sitemonitor/targets/${editing.id}`, { method: 'PUT', body })
      }
      setFeedback({ kind: 'ok', text: editing.id == null ? `已添加监控「${name}」` : '监控已更新' })
      setEditing(null)
      await load()
    } catch (e) {
      setFormErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(t: Target) {
    if (busy || !isAdmin) return
    if (!window.confirm(`确认删除监控「${t.name}」?此操作不可恢复。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/sitemonitor/targets/${t.id}`, { method: 'DELETE', headers: DANGER })
      if (trafficId === t.id) setTrafficId(null)
      setFeedback({ kind: 'ok', text: `监控「${t.name}」已删除` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const stats = useMemo(() => {
    const total = targets.length
    const up = targets.filter((t) => t.last_status === 'up').length
    const down = targets.filter((t) => t.last_status === 'down').length
    const avg = total ? targets.reduce((s, t) => s + (t.availability || 0), 0) / total : 0
    return { total, up, down, avg }
  }, [targets])

  const columns: Column<Target>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '名称',
        cell: (t) => (
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <Globe size={15} className="shrink-0 text-warn" />
            <span className="truncate">{t.name}</span>
          </span>
        ),
      },
      {
        key: 'url',
        header: 'URL',
        cell: (t) => (
          <span className="block max-w-[280px] truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {t.url}
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '88px',
        cell: (t) => {
          const m = STATUS_META[t.last_status] ?? STATUS_META.unknown
          return <Badge status={m.badge}>{m.text}</Badge>
        },
      },
      {
        key: 'latency',
        header: '响应时间',
        width: '96px',
        align: 'right',
        cell: (t) => (
          <span className="tabular-nums text-text">{fmtLatency(t.last_latency_ms, t.last_status)}</span>
        ),
      },
      {
        key: 'avail',
        header: '可用率',
        width: '88px',
        align: 'right',
        cell: (t) => <span className="tabular-nums text-text">{fmtAvailability(t.availability)}</span>,
      },
      {
        key: 'checked',
        header: '最近检测',
        width: '120px',
        cell: (t) => <span className="text-xs text-muted">{fmtChecked(t.last_checked_at)}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '150px',
        align: 'right',
        cell: (t) => (
          <ActionLinks>
            <ActionLink
              disabled={!canWrite}
              title={canWrite ? '编辑监控' : '需要 operator 角色'}
              onClick={() => {
                setFormErr(null)
                setEditing({
                  id: t.id,
                  form: {
                    name: t.name,
                    url: t.url,
                    interval_sec: t.interval_sec,
                    timeout_sec: t.timeout_sec,
                    enabled: t.enabled,
                  },
                })
              }}
            >
              编辑
            </ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin}
              title={isAdmin ? '删除监控' : '需要 admin 角色'}
              onClick={() => void remove(t)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    // remove 闭包随 busy 变化,但读的是最新值;仅依赖角色门控足够。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, canWrite],
  )

  const trafficTarget = trafficId == null ? null : targets.find((t) => t.id === trafficId) ?? null

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
            网站监控
          </h1>
          <p className="text-xs text-muted">
            主动探测被监控目标的 HTTP 健康状态,实时展示在线状态、响应时延与可用率。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="md"
            disabled={!canWrite}
            title={canWrite ? undefined : '需要 operator 角色'}
            onClick={() => {
              setFormErr(null)
              setEditing({ id: null, form: { ...EMPTY_FORM } })
            }}
          >
            <Plus size={15} />
            添加监控
          </Button>
          <Button variant="ghost" size="md" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
            刷新
          </Button>
        </div>
      </header>

      {loadErr && targets.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      {loading && targets.length === 0 ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat value={stats.total.toLocaleString()} label="监控目标" />
            <Stat value={stats.up.toLocaleString()} label="在线" />
            <Stat value={stats.down.toLocaleString()} label="离线" />
            <Stat value={fmtAvailability(stats.avg)} label="平均可用率" />
          </Card>

          <Table
            columns={columns}
            rows={targets}
            rowKey={(t) => t.id}
            emptyText={
              <span className="flex flex-col items-center gap-1 py-6">
                <Activity size={22} className="text-warn" />
                <span className="text-sm font-medium text-text">还没有监控目标</span>
                <span className="text-xs text-muted">
                  {canWrite
                    ? '点击右上「添加监控」配置第一个探测目标。'
                    : '尚无监控目标,添加需要 operator 角色。'}
                </span>
              </span>
            }
          />

          {targets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">流量分析(基于 nginx 访问日志):</span>
              {targets.map((t) => (
                <Button
                  key={t.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTrafficId(t.id)}
                >
                  <BarChart3 size={13} />
                  {t.name}
                </Button>
              ))}
            </div>
          )}

          {!canWrite && (
            <p className="text-xs text-muted">添加 / 编辑监控需要 operator 角色,删除需要 admin。</p>
          )}
        </>
      )}

      {editing && (
        <Modal
          title={editing.id == null ? '添加监控' : '编辑监控'}
          size="sm"
          onClose={() => setEditing(null)}
        >
          <div className="flex flex-col gap-4">
            <Input
              label="名称"
              value={editing.form.name}
              onChange={(e) =>
                setEditing((s) => (s ? { ...s, form: { ...s.form, name: e.target.value } } : s))
              }
            />
            <Input
              label="URL"
              placeholder="https://example.com/health"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={editing.form.url}
              onChange={(e) =>
                setEditing((s) => (s ? { ...s, form: { ...s.form, url: e.target.value } } : s))
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-muted">检测间隔(秒)</span>
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={editing.form.interval_sec}
                  onChange={(e) =>
                    setEditing((s) =>
                      s
                        ? {
                            ...s,
                            form: {
                              ...s.form,
                              interval_sec: Number(e.target.value.replace(/\D/g, '')) || 0,
                            },
                          }
                        : s,
                    )
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-muted">超时(秒)</span>
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={editing.form.timeout_sec}
                  onChange={(e) =>
                    setEditing((s) =>
                      s
                        ? {
                            ...s,
                            form: {
                              ...s.form,
                              timeout_sec: Number(e.target.value.replace(/\D/g, '')) || 0,
                            },
                          }
                        : s,
                    )
                  }
                />
              </label>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-text">启用探测</span>
                <span className="text-xs text-muted">关闭后保留配置但不主动检测。</span>
              </span>
              <Switch
                checked={editing.form.enabled}
                aria-label="启用探测"
                onChange={(next) =>
                  setEditing((s) => (s ? { ...s, form: { ...s.form, enabled: next } } : s))
                }
              />
            </label>
            {formErr && <p className="text-sm text-crit">{formErr}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                取消
              </Button>
              <Button onClick={() => void submit()} disabled={busy}>
                {busy && <Spinner size={14} />}
                {editing.id == null ? '添加' : '保存'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {trafficTarget && (
        <Modal
          title={`流量分析 · ${trafficTarget.name}`}
          size="lg"
          onClose={() => setTrafficId(null)}
        >
          <TrafficSection target={trafficTarget} />
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

interface StatusBuckets {
  '2xx': number
  '3xx': number
  '4xx': number
  '5xx': number
  other: number
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
  top_urls: Count[]
}

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

/** 流量分析:沿用既有 nginx 日志分析端点,展示趋势与状态码分布。探测目标的可用性数据在主表。 */
function TrafficSection({ target }: { target: Target }) {
  const [report, setReport] = useState<Report | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const from = Math.floor(Date.now() / 1000) - 24 * 3600
    const q = `from=${from}&top=10`
    setLoading(true)
    setErr(null)
    Promise.all([
      apiFetch<Report>(`/api/m/sitemonitor/overview?${q}`),
      apiFetch<TrendPoint[]>(`/api/m/sitemonitor/trend?${q}&granularity=hour`),
    ])
      .then(([rep, tr]) => {
        if (!alive) return
        setReport(rep)
        setTrend(tr ?? [])
      })
      .catch((e) => {
        if (alive) setErr(errorText(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [target.id])

  const statusSlices: StatusSlice[] = report
    ? (Object.keys(STATUS_COLORS) as (keyof StatusBuckets)[]).map((k) => ({
        name: k,
        value: report.status[k],
        color: STATUS_COLORS[k],
      }))
    : []

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  if (err || !report) {
    return <p className="py-6 text-center text-sm text-muted">{err ?? '暂无流量数据。'}</p>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat value={report.total_requests.toLocaleString()} label="请求数" />
        <Stat value={fmtBytes(report.total_bytes)} label="带宽" />
        <Stat value={report.unique_ips.toLocaleString()} label="独立 IP (UV)" />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-text">近 24 小时趋势与状态码分布</h3>
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
      {report.top_urls.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-text">Top URL</h3>
          <div className="divide-y divide-border rounded-(--radius-card) border border-border">
            {report.top_urls.map((c) => (
              <div key={uid()} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-muted">
                  {c.key}
                </span>
                <span className="shrink-0 tabular-nums text-text">{c.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
