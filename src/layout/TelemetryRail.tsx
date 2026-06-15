import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { usePoll } from '../hooks/usePoll'
import { Sparkline } from '../components/Sparkline'
import type { Metrics } from '../api/types'

const POLL_MS = 2500
const WINDOW = 24

function fetchMetrics() {
  return apiFetch<Metrics>('/api/m/dashboard/metrics')
}

/** TelemetryRail 顶栏常驻系统脉搏:呼吸在线点 + CPU% mono 读数 + 内存用量 Sparkline。 */
export function TelemetryRail() {
  const { data, error } = usePoll(fetchMetrics, POLL_MS)
  const [mem, setMem] = useState<number[]>([])

  useEffect(() => {
    if (!data) return
    const pct = data.mem_total > 0 ? (data.mem_used / data.mem_total) * 100 : 0
    setMem((prev) => [...prev, pct].slice(-WINDOW))
  }, [data])

  const online = !error && data !== null
  const cpu = data ? data.cpu_percent.toFixed(1) : '--.-'
  const memPct = mem.length > 0 ? mem[mem.length - 1] : null

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${online ? 'bg-online animate-breathe' : 'bg-crit'}`}
          aria-hidden
        />
        <span className="text-muted">{online ? '在线' : '离线'}</span>
      </span>
      <span className="font-[family-name:var(--font-mono)] tabular-nums text-text">
        cpu {cpu}
        <span className="text-muted">%</span>
      </span>
      <span className="hidden items-center gap-2 sm:flex">
        <span className="text-xs lowercase tracking-wide text-muted">mem</span>
        {mem.length >= 2 ? (
          <Sparkline data={mem} width={96} height={24} />
        ) : (
          <span className="font-[family-name:var(--font-mono)] tabular-nums text-text">
            {memPct === null ? '--' : memPct.toFixed(0)}
            <span className="text-muted">%</span>
          </span>
        )}
      </span>
    </div>
  )
}
