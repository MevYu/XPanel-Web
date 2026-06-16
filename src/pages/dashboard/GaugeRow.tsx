import { formatBytes } from '../../lib/format'
import type { Metrics, DetailMetrics } from '../../api/types'
import { Gauge, GaugeDetailRow, MiniBar, clampPct, levelFor } from './Gauge'

const pct = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0)

/** GaugeRow 顶部一排状态球:负载 / CPU / 内存 / 磁盘,hover 显出各自细节。 */
export function GaugeRow({ m, detail }: { m: Metrics; detail: DetailMetrics | null }) {
  const cores = detail?.cpu_per_core.length ?? 0
  const load1 = detail?.load.load1 ?? 0
  // 负载相对核数的饱和度:load1 == 核数 ≈ 满载(100%)。
  const loadPct = cores > 0 ? (load1 / cores) * 100 : 0

  const memPct = clampPct(pct(m.mem_used, m.mem_total))
  const diskPct = clampPct(pct(m.disk_used, m.disk_total))

  return (
    <div className="grid grid-cols-2 justify-items-center gap-y-8 sm:gap-y-10 lg:grid-cols-4">
      <Gauge
        pct={loadPct}
        reading={load1.toFixed(2)}
        label="负载"
        detail={detail && <LoadDetail detail={detail} cores={cores} />}
      />
      <Gauge
        pct={m.cpu_percent}
        reading={m.cpu_percent.toFixed(1)}
        unit="%"
        label="cpu"
        detail={detail && <CpuDetail detail={detail} />}
      />
      <Gauge
        pct={memPct}
        reading={memPct.toFixed(0)}
        unit="%"
        label="内存"
        detail={detail && <MemDetail m={m} detail={detail} />}
      />
      <Gauge
        pct={diskPct}
        reading={diskPct.toFixed(0)}
        unit="%"
        label="磁盘"
        detail={<DiskDetail m={m} detail={detail} />}
      />
    </div>
  )
}

function LoadDetail({ detail, cores }: { detail: DetailMetrics; cores: number }) {
  const { load1, load5, load15 } = detail.load
  return (
    <div className="flex flex-col gap-2">
      <GaugeDetailRow label="1 分钟" value={load1.toFixed(2)} tone={levelFor((load1 / cores) * 100)} />
      <GaugeDetailRow label="5 分钟" value={load5.toFixed(2)} />
      <GaugeDetailRow label="15 分钟" value={load15.toFixed(2)} />
      <div className="my-1 h-px bg-border" aria-hidden />
      <GaugeDetailRow label="cpu 核数" value={`${cores}`} />
    </div>
  )
}

function CpuDetail({ detail }: { detail: DetailMetrics }) {
  const cores = detail.cpu_per_core
  return (
    <div className="flex flex-col gap-2.5">
      <GaugeDetailRow label="核数" value={`${cores.length}`} />
      <div className="my-0.5 h-px bg-border" aria-hidden />
      <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto pr-1">
        {cores.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-9 shrink-0 font-[family-name:var(--font-mono)] text-[0.7rem] tabular-nums text-muted">
              核{i}
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

function MemDetail({ m, detail }: { m: Metrics; detail: DetailMetrics }) {
  const mem = detail.memory
  const swapPct = pct(mem.swap_used, mem.swap_total)
  return (
    <div className="flex flex-col gap-2">
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

function DiskDetail({ m, detail }: { m: Metrics; detail: DetailMetrics | null }) {
  const devices = detail?.disk_io.map((d) => d.name) ?? []
  return (
    <div className="flex flex-col gap-2">
      <GaugeDetailRow label="已用" value={formatBytes(m.disk_used)} />
      <GaugeDetailRow label="总量" value={formatBytes(m.disk_total)} />
      <GaugeDetailRow label="可用" value={formatBytes(Math.max(0, m.disk_total - m.disk_used))} />
      {devices.length > 0 && (
        <>
          <div className="my-1 h-px bg-border" aria-hidden />
          <GaugeDetailRow label="io 设备" value={`${devices.length}`} />
          <span
            className="truncate font-[family-name:var(--font-mono)] text-[0.7rem] text-faint"
            title={devices.join(' · ')}
          >
            {devices.join(' · ')}
          </span>
        </>
      )}
    </div>
  )
}
