import type { ReactNode } from 'react'
import { Card } from '../../components/Card'
import { formatBytes } from '../../lib/format'
import type { Metrics, DetailMetrics, SysInfo } from '../../api/types'
import { Gauge, GaugeDetailRow, MiniBar, clampPct, levelFor } from './Gauge'

const pct = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0)

// 对齐 aaPanel Sys Status 三环形态(直径 ~130、超细描边)。
const RING = 132

// 负载相对核数 <0.7 视为平稳,对应 aaPanel "Smooth operation"。
function loadText(load1: number, cores: number): string {
  if (cores <= 0) return '运行中'
  const ratio = load1 / cores
  if (ratio < 0.7) return '运行平稳'
  if (ratio < 1) return '负载偏高'
  return '负载过载'
}

/** SysStatusCard aaPanel Sys Status 卡:负载 / CPU / 内存三环,环下含均值/核数/用量副标。 */
export function SysStatusCard({
  m,
  detail,
  sysinfo,
}: {
  m: Metrics
  detail: DetailMetrics | null
  sysinfo: SysInfo | null
}) {
  const cores = detail?.cpu_per_core.length ?? 0
  const load1 = detail?.load.load1 ?? 0
  const loadPct = cores > 0 ? (load1 / cores) * 100 : 0
  const memPct = clampPct(pct(m.mem_used, m.mem_total))

  return (
    <Card className="flex flex-col gap-6">
      <h3 className="text-sm font-medium text-text">系统状态</h3>
      <div className="grid grid-cols-3 gap-6 py-2">
        <RingCell
          gauge={
            <Gauge
              size={RING}
              pct={loadPct}
              reading={load1.toFixed(2)}
              label="负载"
              detail={detail && <LoadDetail detail={detail} cores={cores} load1={load1} />}
            />
          }
          primary={loadText(load1, cores)}
          secondary={
            detail
              ? `${detail.load.load1.toFixed(2)} / ${detail.load.load5.toFixed(2)} / ${detail.load.load15.toFixed(2)}`
              : '—'
          }
        />
        <RingCell
          gauge={
            <Gauge
              size={RING}
              pct={m.cpu_percent}
              reading={m.cpu_percent.toFixed(1)}
              unit="%"
              label="cpu"
              detail={detail && <CpuDetail detail={detail} sysinfo={sysinfo} cpuPct={m.cpu_percent} />}
            />
          }
          primary="CPU 占用"
          secondary={`${cores} 核`}
        />
        <RingCell
          gauge={
            <Gauge
              size={RING}
              pct={memPct}
              reading={memPct.toFixed(0)}
              unit="%"
              label="内存"
              detail={detail && <MemDetail m={m} detail={detail} memPct={memPct} />}
            />
          }
          primary="内存占用"
          secondary={`${formatBytes(m.mem_used)} / ${formatBytes(m.mem_total)}`}
        />
      </div>
    </Card>
  )
}

// RingCell 单环格:环 + 主副标(对齐 aaPanel 环下两行说明)。
function RingCell({
  gauge,
  primary,
  secondary,
}: {
  gauge: React.ReactNode
  primary: string
  secondary: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {gauge}
      <span className="text-sm text-text">{primary}</span>
      <span className="font-[family-name:var(--font-mono)] text-[0.7rem] tabular-nums text-muted">
        {secondary}
      </span>
    </div>
  )
}

// DetailHeader aaPanel 浮层顶部强调标题行:资源名 + 当前占用大字 + 分隔线。
function DetailHeader({ title, reading }: { title: string; reading: string }) {
  return (
    <div className="-mx-4 -mt-4 mb-3 border-b border-border px-4 pb-3 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-text">{title}</span>
        <span className="font-[family-name:var(--font-mono)] text-base font-bold tabular-nums text-text">
          {reading}
        </span>
      </div>
    </div>
  )
}

// DetailInfoRow 浮层信息行:无标签的整行文本(CPU 型号、核数说明)。
function DetailInfoRow({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-snug text-muted">{children}</p>
}

function LoadDetail({
  detail,
  cores,
  load1,
}: {
  detail: DetailMetrics
  cores: number
  load1: number
}) {
  const { load5, load15 } = detail.load
  return (
    <div className="flex flex-col gap-2">
      <DetailHeader title="负载" reading={load1.toFixed(2)} />
      <GaugeDetailRow
        label="1 分钟"
        value={load1.toFixed(2)}
        tone={cores > 0 ? levelFor((load1 / cores) * 100) : undefined}
      />
      <GaugeDetailRow label="5 分钟" value={load5.toFixed(2)} />
      <GaugeDetailRow label="15 分钟" value={load15.toFixed(2)} />
      <div className="my-1 h-px bg-border" aria-hidden />
      <GaugeDetailRow label="CPU 核数" value={`${cores}`} />
    </div>
  )
}

function CpuDetail({
  detail,
  sysinfo,
  cpuPct,
}: {
  detail: DetailMetrics
  sysinfo: SysInfo | null
  cpuPct: number
}) {
  const cores = detail.cpu_per_core
  const physical = sysinfo?.cpu_physical_cores
  const logical = sysinfo?.cpu_logical_cores
  return (
    <div className="flex flex-col gap-2.5">
      <DetailHeader title="CPU 占用" reading={`${cpuPct.toFixed(1)}%`} />
      {sysinfo?.cpu_model && sysinfo.cpu_model !== 'Undefined' && (
        <DetailInfoRow>{sysinfo.cpu_model}</DetailInfoRow>
      )}
      {physical != null && logical != null && (
        <DetailInfoRow>
          {`${cores.length} 核(物理 ${physical} / 逻辑 ${logical}）`}
        </DetailInfoRow>
      )}
      <div className="my-0.5 h-px bg-border" aria-hidden />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {cores.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-8 shrink-0 font-[family-name:var(--font-mono)] text-[0.7rem] tabular-nums text-muted">
              {i}
            </span>
            <MiniBar pct={p} />
            <span className="w-8 shrink-0 text-right font-[family-name:var(--font-mono)] text-[0.7rem] tabular-nums text-muted">
              {p.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MemDetail({
  m,
  detail,
  memPct,
}: {
  m: Metrics
  detail: DetailMetrics
  memPct: number
}) {
  const mem = detail.memory
  const swapPct = pct(mem.swap_used, mem.swap_total)
  return (
    <div className="flex flex-col gap-2">
      <DetailHeader title="内存占用" reading={`${memPct.toFixed(0)}%`} />
      <GaugeDetailRow label="已用" value={formatBytes(m.mem_used)} />
      <GaugeDetailRow label="总量" value={formatBytes(m.mem_total)} />
      <GaugeDetailRow label="可用" value={formatBytes(mem.available)} />
      <div className="my-1 h-px bg-border" aria-hidden />
      <GaugeDetailRow label="cached" value={formatBytes(mem.cached)} />
      <GaugeDetailRow label="buffers" value={formatBytes(mem.buffers)} />
      <div className="my-1 h-px bg-border" aria-hidden />
      <GaugeDetailRow
        label="swap"
        value={
          mem.swap_total > 0
            ? `${formatBytes(mem.swap_used)} / ${formatBytes(mem.swap_total)}`
            : '未启用'
        }
        tone={mem.swap_total > 0 ? levelFor(swapPct) : undefined}
      />
    </div>
  )
}
