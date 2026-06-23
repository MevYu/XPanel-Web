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
import type { TrafficHistory } from './dashboard/TrafficCard'

const POLL_MS = 2500
// 速率历史滑动窗口长度(约 50 个采样,2.5s/次 ≈ 2 分钟)。
const HISTORY_LEN = 50

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

// diffDisk 差分每磁盘设备 read/write 速率(B/s);无前次或 Δt<=0 返回全机聚合零值。
function diffDisk(
  prev: { t: number; detail: DetailMetrics } | null,
  curr: DetailMetrics,
  now: number,
): { read: number; write: number } {
  if (!prev) return { read: 0, write: 0 }
  const dt = (now - prev.t) / 1000
  if (dt <= 0) return { read: 0, write: 0 }
  const prevDisk = new Map(prev.detail.disk_io.map((d) => [d.name, d]))
  let read = 0
  let write = 0
  for (const d of curr.disk_io) {
    const p = prevDisk.get(d.name)
    if (!p) continue
    // 计数器回绕或重启会出现负差,夹到 0。
    read += Math.max(0, d.read_bytes - p.read_bytes) / dt
    write += Math.max(0, d.write_bytes - p.write_bytes) / dt
  }
  return { read, write }
}

// pushWindow 向滑动窗口追加一个采样点并截断到 HISTORY_LEN。
function pushWindow<T>(window: T[], point: T): T[] {
  const next = window.length >= HISTORY_LEN ? window.slice(1) : window.slice()
  next.push(point)
  return next
}

/** Dashboard 系统总览:对齐 aaPanel 首页——系统状态(三环)+磁盘 / 概览计数 / 服务状态+流量。 */
export default function Dashboard() {
  const { data, error, loading } = usePoll(fetchMetrics, POLL_MS)
  const detail = usePoll(fetchDetail, POLL_MS)
  const [net, setNet] = useState<NetRate[]>([])
  const [history, setHistory] = useState<TrafficHistory>({ net: [], disk: [] })
  // 上一次 detail 采样(含时间戳),供差分算网络/磁盘速率。
  const prevDetail = useRef<{ t: number; detail: DetailMetrics } | null>(null)

  useEffect(() => {
    const d = detail.data
    if (!d) return
    const now = Date.now()
    const rates = diffNet(prevDetail.current, d, now)
    setNet(rates)
    // 全机聚合:网络上/下行四条计数器之和差分,磁盘读/写同理,push 进滑动窗口。
    if (prevDetail.current) {
      const tx = rates.reduce((s, n) => s + n.tx, 0)
      const rx = rates.reduce((s, n) => s + n.rx, 0)
      const disk = diffDisk(prevDetail.current, d, now)
      setHistory((h) => ({
        net: pushWindow(h.net, { t: now, a: tx, b: rx }),
        disk: pushWindow(h.disk, { t: now, a: disk.write, b: disk.read }),
      }))
    }
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
    <div className="flex flex-col gap-5">
      <TopBar uptimeSec={detail.data?.uptime_sec ?? null} />

      {/* aaPanel 首页第一行:系统状态(三环) + 磁盘(分区列表) */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <SysStatusCard m={m} detail={detail.data} />
        <DiskCard m={m} />
      </div>

      {/* aaPanel 首页:概览计数小卡一排 */}
      <OverviewStats />

      {/* aaPanel 首页:服务状态(软件) + 流量 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ServicesCard />
        <TrafficCard detail={detail.data} net={net} history={history} error={!!detail.error} />
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
