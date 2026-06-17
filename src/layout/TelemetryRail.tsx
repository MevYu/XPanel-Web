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
    <div className="flex items-center gap-3 rounded-full border border-border bg-surface-2/60 py-1.5 pl-3 pr-3.5 text-sm shadow-[var(--inset-hl)] sm:gap-4">
      <span className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${online ? 'bg-online shadow-[0_0_8px_rgba(63,181,127,0.6)] animate-breathe' : 'bg-crit shadow-[0_0_8px_rgba(229,72,77,0.6)]'}`}
          aria-hidden
        />
        <span className={online ? 'text-muted' : 'text-crit'}>{online ? '在线' : '离线'}</span>
      </span>
      <span className="h-4 w-px bg-border" aria-hidden />
      <span className="font-[family-name:var(--font-mono)] tabular-nums text-text">
        <span className="text-faint">cpu</span> {cpu}
        <span className="text-muted">%</span>
      </span>
      <span className="hidden items-center gap-2 sm:flex">
        <span className="text-xs lowercase tracking-wide text-faint">mem</span>
        {mem.length >= 2 ? (
          <>
            <Sparkline data={mem} width={96} height={24} />
            <span className="font-[family-name:var(--font-mono)] tabular-nums text-text">
              {memPct === null ? '--' : memPct.toFixed(0)}
              <span className="text-muted">%</span>
            </span>
          </>
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
