import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { usePoll } from '../hooks/usePoll'
import { Card } from '../components/Card'
import { Spinner } from '../components/Spinner'
import { Badge } from '../components/Badge'
import { formatDuration } from '../lib/format'
import type { Metrics, DetailMetrics } from '../api/types'
import { OverviewStats } from './dashboard/OverviewStats'
import { ServicesCard } from './dashboard/ServicesCard'
import { SysStatusCard } from './dashboard/SysStatusCard'
import { DiskCard } from './dashboard/DiskCard'
import { TrafficCard } from './dashboard/TrafficCard'

const POLL_MS = 2500

function fetchMetrics() {
  return apiFetch<Metrics>('/api/m/dashboard/metrics')
}

function fetchDetail() {
  return apiFetch<DetailMetrics>('/api/m/dashboard/metrics/detail')
}

// 每网卡的 rx/tx 字节速率(B/s),由相邻两次累计计数差分得出,供流量卡显示实时上下行。
export interface NetRate {
  name: string
  rx: number
  tx: number
}

// diffNet 用上一次与本次 detail 采样差分算每网卡 rx/tx 速率;无前次或 Δt<=0 返回空。
function diffNet(
  prev: { t: number; detail: DetailMetrics } | null,
  curr: DetailMetrics,
  now: number,
): NetRate[] {
  if (!prev) return []
  const dt = (now - prev.t) / 1000
  if (dt <= 0) return []
  const prevNet = new Map(prev.detail.network.map((n) => [n.name, n]))
  return curr.network.map((n) => {
    const p = prevNet.get(n.name)
    // 计数器回绕或重启会出现负差,夹到 0 而非显示负速率。
    return {
      name: n.name,
      rx: p ? Math.max(0, n.bytes_recv - p.bytes_recv) / dt : 0,
      tx: p ? Math.max(0, n.bytes_sent - p.bytes_sent) / dt : 0,
    }
  })
}

/** Dashboard 系统总览:对齐 aaPanel 首页——系统状态(三环)+磁盘 / 概览计数 / 服务状态+流量。 */
export default function Dashboard() {
  const { data, error, loading } = usePoll(fetchMetrics, POLL_MS)
  const detail = usePoll(fetchDetail, POLL_MS)
  const [net, setNet] = useState<NetRate[]>([])
  // 上一次 detail 采样(含时间戳),供差分算网络速率。
  const prevDetail = useRef<{ t: number; detail: DetailMetrics } | null>(null)

  useEffect(() => {
    const d = detail.data
    if (!d) return
    const now = Date.now()
    setNet(diffNet(prevDetail.current, d, now))
    prevDetail.current = { t: now, detail: d }
  }, [detail.data])

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  if (error && !data) {
    return (
      <Card className="text-sm text-muted">
        无法获取系统指标,请确认后端服务在运行,稍后重试。
      </Card>
    )
  }

  const m = data!

  return (
    <div className="flex flex-col gap-4">
      <TopBar uptimeSec={detail.data?.uptime_sec ?? null} />

      {/* aaPanel 首页第一行:系统状态(三环) + 磁盘(分区列表) */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <SysStatusCard m={m} detail={detail.data} />
        <DiskCard m={m} />
      </div>

      {/* aaPanel 首页:概览计数小卡一排 */}
      <OverviewStats />

      {/* aaPanel 首页:服务状态(软件) + 流量 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ServicesCard />
        <TrafficCard detail={detail.data} net={net} error={!!detail.error} />
      </div>
    </div>
  )
}

// TopBar aaPanel 顶部行:主机名 + 版本徽标 + 运行时长 + 实时刷新指示。
function TopBar({ uptimeSec }: { uptimeSec: number | null }) {
  const [info, setInfo] = useState<{ hostname: string; panel_version: string } | null>(null)
  useEffect(() => {
    apiFetch<{ hostname: string; panel_version: string }>('/api/m/dashboard/sysinfo')
      .then(setInfo)
      .catch(() => {})
  }, [])
  return (
    <header className="flex flex-wrap items-center gap-3">
      <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
        {info?.hostname || '系统总览'}
      </h1>
      {info?.panel_version && <Badge status="neutral">XPanel {info.panel_version}</Badge>}
      {uptimeSec != null && <Badge status="online">运行 {formatDuration(uptimeSec)}</Badge>}
      <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-online" aria-hidden />
        每 2.5s 实时刷新
      </span>
    </header>
  )
}
