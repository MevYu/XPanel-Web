import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { usePoll } from '../hooks/usePoll'
import { Card } from '../components/Card'
import { Stat } from '../components/Stat'
import { Spinner } from '../components/Spinner'
import { Sparkline } from '../components/Sparkline'
import { formatBytes, formatRate, formatDuration } from '../lib/format'
import type { Metrics, DetailMetrics, ProcessInfo } from '../api/types'

// recharts 懒加载,移出首屏主包(首次渲染图表时才拉取该 vendor chunk)。
const CpuTrendChart = lazy(() => import('./CpuTrendChart'))

const POLL_MS = 2500
const WINDOW = 40

type Level = 'ok' | 'warn' | 'crit'

// 利用率阈值 → 配色等级:>92% 危急、>80% 警告、其余正常。
function levelFor(pct: number): Level {
  if (pct > 92) return 'crit'
  if (pct > 80) return 'warn'
  return 'ok'
}

const levelText: Record<Level, string> = {
  ok: 'text-text',
  warn: 'text-warn',
  crit: 'text-crit',
}

const levelStroke: Record<Level, string> = {
  ok: 'var(--color-brand)',
  warn: 'var(--color-warn)',
  crit: 'var(--color-crit)',
}

function fetchMetrics() {
  return apiFetch<Metrics>('/api/m/dashboard/metrics')
}

function fetchDetail() {
  return apiFetch<DetailMetrics>('/api/m/dashboard/metrics/detail')
}

function fetchProcesses() {
  return apiFetch<ProcessInfo[]>('/api/m/dashboard/processes?limit=20')
}

const PROC_LIMIT = 15

interface Sample {
  t: number
  cpu: number
}

// 每网卡的 rx/tx 字节速率(B/s),由相邻两次累计计数差分得出。
interface NetRate {
  name: string
  rx: number
  tx: number
}

// 每磁盘设备的读/写字节速率(B/s)。
interface DiskRate {
  name: string
  read: number
  write: number
}

interface Rates {
  net: NetRate[]
  disk: DiskRate[]
}

// diffRates 用上一次采样与本次采样差分算速率;Δt<=0 或无前次时返回空,首帧不出图。
function diffRates(
  prev: { t: number; detail: DetailMetrics } | null,
  curr: DetailMetrics,
  now: number,
): Rates {
  if (!prev) return { net: [], disk: [] }
  const dt = (now - prev.t) / 1000
  if (dt <= 0) return { net: [], disk: [] }

  const prevNet = new Map(prev.detail.network.map((n) => [n.name, n]))
  const net = curr.network.map((n) => {
    const p = prevNet.get(n.name)
    return {
      name: n.name,
      // 计数器回绕或重启会出现负差,夹到 0 而非显示负速率。
      rx: p ? Math.max(0, n.bytes_recv - p.bytes_recv) / dt : 0,
      tx: p ? Math.max(0, n.bytes_sent - p.bytes_sent) / dt : 0,
    }
  })

  const prevDisk = new Map(prev.detail.disk_io.map((d) => [d.name, d]))
  const disk = curr.disk_io.map((d) => {
    const p = prevDisk.get(d.name)
    return {
      name: d.name,
      read: p ? Math.max(0, d.read_bytes - p.read_bytes) / dt : 0,
      write: p ? Math.max(0, d.write_bytes - p.write_bytes) / dt : 0,
    }
  })

  return { net, disk }
}

/** Dashboard 系统总览:CPU/内存/磁盘活体读数 + CPU% 滑窗趋势图。 */
export default function Dashboard() {
  const { data, error, loading } = usePoll(fetchMetrics, POLL_MS)
  const detail = usePoll(fetchDetail, POLL_MS)
  const procs = usePoll(fetchProcesses, POLL_MS)
  const [series, setSeries] = useState<Sample[]>([])
  const [rates, setRates] = useState<Rates>({ net: [], disk: [] })
  // 每网卡 rx/tx 速率滑窗,键为网卡名;用于 Sparkline。
  const [netHistory, setNetHistory] = useState<Record<string, { rx: number[]; tx: number[] }>>({})
  // 上一次 detail 采样(含时间戳),供差分算速率。
  const prevDetail = useRef<{ t: number; detail: DetailMetrics } | null>(null)

  useEffect(() => {
    if (!data) return
    setSeries((prev) => [...prev, { t: Date.now(), cpu: data.cpu_percent }].slice(-WINDOW))
  }, [data])

  useEffect(() => {
    const d = detail.data
    if (!d) return
    const now = Date.now()
    const next = diffRates(prevDetail.current, d, now)
    prevDetail.current = { t: now, detail: d }
    setRates(next)
    if (next.net.length === 0) return
    setNetHistory((prev) => {
      const out: Record<string, { rx: number[]; tx: number[] }> = {}
      for (const n of next.net) {
        const h = prev[n.name] ?? { rx: [], tx: [] }
        out[n.name] = {
          rx: [...h.rx, n.rx].slice(-WINDOW),
          tx: [...h.tx, n.tx].slice(-WINDOW),
        }
      }
      return out
    })
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
  // 夹紧 [0,100]:后端可能上报 used>total,避免文字与色阶显示 >100%。
  const clampPct = (pct: number) => Math.min(100, Math.max(0, pct))
  const memPct = clampPct(m.mem_total > 0 ? (m.mem_used / m.mem_total) * 100 : 0)
  const diskPct = clampPct(m.disk_total > 0 ? (m.disk_used / m.disk_total) * 100 : 0)
  const cpuLevel = levelFor(m.cpu_percent)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <VitalCard label="cpu 利用率" pct={m.cpu_percent}>
          <Stat
            value={
              <span className={levelText[cpuLevel]}>
                {m.cpu_percent.toFixed(1)}
                <span className="text-muted">%</span>
              </span>
            }
            label="cpu 占用"
          />
        </VitalCard>

        <VitalCard label="内存" pct={memPct}>
          <Stat
            value={
              <span className={levelText[levelFor(memPct)]}>
                {memPct.toFixed(0)}
                <span className="text-muted">%</span>
              </span>
            }
            label={`${formatBytes(m.mem_used)} / ${formatBytes(m.mem_total)}`}
          />
        </VitalCard>

        <VitalCard label="磁盘" pct={diskPct}>
          <Stat
            value={
              <span className={levelText[levelFor(diskPct)]}>
                {diskPct.toFixed(0)}
                <span className="text-muted">%</span>
              </span>
            }
            label={`${formatBytes(m.disk_used)} / ${formatBytes(m.disk_total)}`}
          />
        </VitalCard>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">CPU 利用率趋势</h2>
          <span className="text-xs lowercase tracking-wide text-muted">
            最近 {WINDOW} 个采样
          </span>
        </div>
        <div className="h-64">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner size={20} />
              </div>
            }
          >
            <CpuTrendChart series={series} stroke={levelStroke[cpuLevel]} />
          </Suspense>
        </div>
      </Card>

      <DetailSections
        detail={detail.data}
        detailError={!!detail.error}
        rates={rates}
        netHistory={netHistory}
        procs={procs.data}
        procsError={!!procs.error}
      />
    </div>
  )
}

// DetailSections 详细监控分区:每核 CPU、负载、内存细化、网络、磁盘 IO、运行时长、Top 进程。
function DetailSections({
  detail,
  detailError,
  rates,
  netHistory,
  procs,
  procsError,
}: {
  detail: DetailMetrics | null
  detailError: boolean
  rates: Rates
  netHistory: Record<string, { rx: number[]; tx: number[] }>
  procs: ProcessInfo[] | null
  procsError: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="cpu 每核占用">
        {detailError ? (
          <SectionError />
        ) : detail ? (
          <CoreGrid cores={detail.cpu_per_core} />
        ) : (
          <SectionLoading />
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="系统负载">
          {detailError ? (
            <SectionError />
          ) : detail ? (
            <div className="grid grid-cols-3 gap-4">
              <Stat value={detail.load.load1.toFixed(2)} label="load 1m" />
              <Stat value={detail.load.load5.toFixed(2)} label="load 5m" />
              <Stat value={detail.load.load15.toFixed(2)} label="load 15m" />
            </div>
          ) : (
            <SectionLoading />
          )}
        </SectionCard>

        <SectionCard title="运行时长">
          {detailError ? (
            <SectionError />
          ) : detail ? (
            <Stat
              value={formatDuration(detail.uptime_sec)}
              label={`自 ${new Date(detail.boot_time * 1000).toLocaleString('zh-CN')} 启动`}
            />
          ) : (
            <SectionLoading />
          )}
        </SectionCard>
      </div>

      <SectionCard title="内存细化">
        {detailError ? (
          <SectionError />
        ) : detail ? (
          <MemoryDetail memory={detail.memory} />
        ) : (
          <SectionLoading />
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="网络速率">
          {detailError ? (
            <SectionError />
          ) : detail ? (
            <NetworkRates rates={rates.net} history={netHistory} />
          ) : (
            <SectionLoading />
          )}
        </SectionCard>

        <SectionCard title="磁盘 io">
          {detailError ? (
            <SectionError />
          ) : detail ? (
            <DiskRates rates={rates.disk} />
          ) : (
            <SectionLoading />
          )}
        </SectionCard>
      </div>

      <SectionCard title={`Top 进程(前 ${PROC_LIMIT})`}>
        {procsError ? (
          <SectionError />
        ) : procs ? (
          <ProcessTable procs={procs} />
        ) : (
          <SectionLoading />
        )}
      </SectionCard>
    </div>
  )
}

// SectionCard 详细分区外壳:统一标题 + Card。
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-4 text-sm font-medium text-muted">{title}</h2>
      {children}
    </Card>
  )
}

function SectionLoading() {
  return (
    <div className="flex h-20 items-center justify-center">
      <Spinner size={18} />
    </div>
  )
}

function SectionError() {
  return <p className="text-sm text-muted">无法获取该指标,稍后重试。</p>
}

// CoreGrid 每核占用条:网格排列,条色按阈值变化。
function CoreGrid({ cores }: { cores: number[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
      {cores.map((pct, i) => {
        const level = levelFor(pct)
        return (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">核 {i}</span>
              <span className={`tabular-nums ${levelText[level]}`}>{pct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, pct))}%`,
                  background: levelStroke[level],
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// MemoryDetail 内存细化:swap 用量 + cached/buffers。
function MemoryDetail({ memory }: { memory: DetailMetrics['memory'] }) {
  const swapPct = memory.swap_total > 0 ? (memory.swap_used / memory.swap_total) * 100 : 0
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat
        value={
          <span className={levelText[levelFor(swapPct)]}>
            {formatBytes(memory.swap_used)}
          </span>
        }
        label={`swap / ${formatBytes(memory.swap_total)}`}
      />
      <Stat value={formatBytes(memory.cached)} label="cached" />
      <Stat value={formatBytes(memory.buffers)} label="buffers" />
      <Stat value={formatBytes(memory.available)} label="可用" />
    </div>
  )
}

// NetworkRates 活跃网卡 rx/tx 速率 + 各自滑窗 Sparkline。
function NetworkRates({
  rates,
  history,
}: {
  rates: NetRate[]
  history: Record<string, { rx: number[]; tx: number[] }>
}) {
  // 仅显示有过流量的网卡,过滤掉静默的 loopback/未用接口。
  const active = rates.filter((n) => {
    const h = history[n.name]
    return n.rx > 0 || n.tx > 0 || (h && (h.rx.some((v) => v > 0) || h.tx.some((v) => v > 0)))
  })
  if (active.length === 0) {
    return <p className="text-sm text-muted">暂无活跃网卡流量。</p>
  }
  return (
    <div className="flex flex-col gap-4">
      {active.map((n) => {
        const h = history[n.name] ?? { rx: [], tx: [] }
        return (
          <div key={n.name} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-[family-name:var(--font-mono)] text-xs text-text">
                {n.name}
              </span>
              <span className="flex gap-4 font-[family-name:var(--font-mono)] text-xs tabular-nums">
                <span className="text-online">↓ {formatRate(n.rx)}</span>
                <span className="text-brand">↑ {formatRate(n.tx)}</span>
              </span>
            </div>
            <div className="flex gap-3">
              <Sparkline data={h.rx} width={160} height={28} className="flex-1" />
              <Sparkline data={h.tx} width={160} height={28} className="flex-1" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// DiskRates 每设备读/写速率。
function DiskRates({ rates }: { rates: DiskRate[] }) {
  if (rates.length === 0) {
    return <p className="text-sm text-muted">暂无磁盘 io 数据。</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {rates.map((d) => (
        <div
          key={d.name}
          className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0"
        >
          <span className="font-[family-name:var(--font-mono)] text-xs text-text">{d.name}</span>
          <span className="flex gap-4 font-[family-name:var(--font-mono)] text-xs tabular-nums">
            <span className="text-online">读 {formatRate(d.read)}</span>
            <span className="text-brand">写 {formatRate(d.write)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

// ProcessTable Top 进程表:按 cpu 降序取前 PROC_LIMIT。
function ProcessTable({ procs }: { procs: ProcessInfo[] }) {
  const rows = [...procs].sort((a, b) => b.cpu_percent - a.cpu_percent).slice(0, PROC_LIMIT)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs lowercase tracking-wide text-muted">
            <th className="pb-2 pr-4 font-medium">pid</th>
            <th className="pb-2 pr-4 font-medium">名称</th>
            <th className="pb-2 pr-4 text-right font-medium">cpu %</th>
            <th className="pb-2 pr-4 text-right font-medium">内存 %</th>
            <th className="pb-2 text-right font-medium">rss</th>
          </tr>
        </thead>
        <tbody className="font-[family-name:var(--font-mono)] tabular-nums">
          {rows.map((p) => (
            <tr key={p.pid} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-4 text-muted">{p.pid}</td>
              <td className="max-w-[16rem] truncate py-1.5 pr-4 text-text" title={p.name}>
                {p.name}
              </td>
              <td className={`py-1.5 pr-4 text-right ${levelText[levelFor(p.cpu_percent)]}`}>
                {p.cpu_percent.toFixed(1)}
              </td>
              <td className="py-1.5 pr-4 text-right text-text">{p.mem_percent.toFixed(1)}</td>
              <td className="py-1.5 text-right text-muted">{formatBytes(p.rss)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// VitalCard 读数卡 + 细进度圈,圈色按阈值随利用率变化。
function VitalCard({
  label,
  pct,
  children,
}: {
  label: string
  pct: number
  children: React.ReactNode
}) {
  return (
    <Card hoverable className="flex items-center justify-between">
      <div className="flex flex-col gap-3">
        <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
        {children}
      </div>
      <ProgressRing pct={pct} />
    </Card>
  )
}

// ProgressRing 进度圈:SVG 双层圆环,前景描边按阈值变色。
function ProgressRing({ pct }: { pct: number }) {
  const size = 64
  const stroke = 6
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const offset = circ * (1 - clamped / 100)
  const color = levelStroke[levelFor(pct)]
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  )
}
