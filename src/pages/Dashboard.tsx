import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { usePoll } from '../hooks/usePoll'
import { Card } from '../components/Card'
import { Spinner } from '../components/Spinner'
import { Badge } from '../components/Badge'
import { formatDuration } from '../lib/format'
import type { Metrics, DetailMetrics, SysInfo } from '../api/types'
import { OverviewStats } from './dashboard/OverviewStats'
import { SoftwareCard } from './dashboard/SoftwareCard'
import { SysStatusCard } from './dashboard/SysStatusCard'
import { DiskCard } from './dashboard/DiskCard'
import { TrafficCard, isRealDisk } from './dashboard/TrafficCard'
import type { TrafficHistory } from './dashboard/TrafficCard'
import type { RatePoint } from './dashboard/TrafficChart'

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

// 每磁盘设备的 read/write 字节速率(B/s)与 read/write IO 次数速率(ops/s),由相邻两次累计计数差分得出。
export interface DiskRate {
  name: string
  read: number
  write: number
  readOps: number
  writeOps: number
}

// diffDisk 差分每磁盘设备 read/write 速率(B/s);无前次或 Δt<=0 返回空。
function diffDisk(
  prev: { t: number; detail: DetailMetrics } | null,
  curr: DetailMetrics,
  now: number,
): DiskRate[] {
  if (!prev) return []
  const dt = (now - prev.t) / 1000
  if (dt <= 0) return []
  const prevDisk = new Map(prev.detail.disk_io.map((d) => [d.name, d]))
  // 只保留真实块设备且累计计数非 0(剔除 loop/ram/fd 及全程无读写的设备)。
  return curr.disk_io
    .filter((d) => isRealDisk(d.name) && (d.read_bytes > 0 || d.write_bytes > 0))
    .map((d) => {
      const p = prevDisk.get(d.name)
      // 计数器回绕或重启会出现负差,夹到 0 而非显示负速率。
      return {
        name: d.name,
        read: p ? Math.max(0, d.read_bytes - p.read_bytes) / dt : 0,
        write: p ? Math.max(0, d.write_bytes - p.write_bytes) / dt : 0,
        readOps: p ? Math.max(0, d.read_count - p.read_count) / dt : 0,
        writeOps: p ? Math.max(0, d.write_count - p.write_count) / dt : 0,
      }
    })
}

// pushWindow 向滑动窗口追加一个采样点并截断到 HISTORY_LEN。
function pushWindow(window: RatePoint[], point: RatePoint): RatePoint[] {
  const next = window.length >= HISTORY_LEN ? window.slice(1) : window.slice()
  next.push(point)
  return next
}

// pushDevices 向各设备的滑动窗口追加本次采样点(以 name 索引),返回新的 per-device map。
// 设备首次出现自动建窗口;消失的设备保留其历史(随窗口滑动自然淡出)。
function pushDevices(
  prev: Record<string, RatePoint[]>,
  points: { name: string; t: number; a: number; b: number }[],
): Record<string, RatePoint[]> {
  const next: Record<string, RatePoint[]> = { ...prev }
  for (const p of points) {
    next[p.name] = pushWindow(next[p.name] ?? [], { t: p.t, a: p.a, b: p.b })
  }
  return next
}

/** Dashboard 系统总览:对齐 aaPanel 首页——系统状态(三环)+磁盘 / 概览计数 / 服务状态+流量。 */
export default function Dashboard() {
  const { data, error, loading } = usePoll(fetchMetrics, POLL_MS)
  const detail = usePoll(fetchDetail, POLL_MS)
  const [net, setNet] = useState<NetRate[]>([])
  // 全机磁盘 TPS(每秒读+写 IO 次数之和),由 diffDisk 各设备 ops 速率聚合。
  const [tps, setTps] = useState(0)
  const [history, setHistory] = useState<TrafficHistory>({
    net: [],
    disk: [],
    netByDevice: {},
    diskByDevice: {},
  })
  // 主机静态信息变化极慢,启动拉一次供 TopBar 标题与 CPU 浮层用。
  const [sysinfo, setSysinfo] = useState<SysInfo | null>(null)
  // 上一次 detail 采样(含时间戳),供差分算网络/磁盘速率。
  const prevDetail = useRef<{ t: number; detail: DetailMetrics } | null>(null)

  useEffect(() => {
    apiFetch<SysInfo>('/api/m/dashboard/sysinfo').then(setSysinfo).catch(() => {})
  }, [])

  useEffect(() => {
    const d = detail.data
    if (!d) return
    const now = Date.now()
    const rates = diffNet(prevDetail.current, d, now)
    setNet(rates)
    // 聚合窗口 + per-device 窗口:网络 a=上行 b=下行,磁盘 a=写 b=读。
    if (prevDetail.current) {
      const tx = rates.reduce((s, n) => s + n.tx, 0)
      const rx = rates.reduce((s, n) => s + n.rx, 0)
      const diskRates = diffDisk(prevDetail.current, d, now)
      const writeSum = diskRates.reduce((s, dr) => s + dr.write, 0)
      const readSum = diskRates.reduce((s, dr) => s + dr.read, 0)
      setTps(diskRates.reduce((s, dr) => s + dr.readOps + dr.writeOps, 0))
      setHistory((h) => ({
        net: pushWindow(h.net, { t: now, a: tx, b: rx }),
        disk: pushWindow(h.disk, { t: now, a: writeSum, b: readSum }),
        netByDevice: pushDevices(
          h.netByDevice,
          rates.map((n) => ({ name: n.name, t: now, a: n.tx, b: n.rx })),
        ),
        diskByDevice: pushDevices(
          h.diskByDevice,
          diskRates.map((dr) => ({ name: dr.name, t: now, a: dr.write, b: dr.read })),
        ),
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
      <TopBar sysinfo={sysinfo} uptimeSec={detail.data?.uptime_sec ?? null} />

      {/* aaPanel 首页第一行:系统状态(三环) + 磁盘(分区列表) */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <SysStatusCard m={m} detail={detail.data} sysinfo={sysinfo} />
        <DiskCard m={m} />
      </div>

      {/* aaPanel 首页:概览计数小卡一排 */}
      <OverviewStats />

      {/* aaPanel 首页:软件(已启用模块入口宫格) + 流量 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SoftwareCard />
        <TrafficCard detail={detail.data} net={net} history={history} tps={tps} error={!!detail.error} />
      </div>
    </div>
  )
}

// TopBar aaPanel 顶部行:主机名 + 版本徽标 + 运行时长 + 实时刷新指示。
function TopBar({ sysinfo, uptimeSec }: { sysinfo: SysInfo | null; uptimeSec: number | null }) {
  const info = sysinfo
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
