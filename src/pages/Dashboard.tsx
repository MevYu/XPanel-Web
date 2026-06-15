import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiFetch } from '../api/client'
import { usePoll } from '../hooks/usePoll'
import { Card } from '../components/Card'
import { Stat } from '../components/Stat'
import { Spinner } from '../components/Spinner'
import { formatBytes } from '../lib/format'
import type { Metrics } from '../api/types'

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

interface Sample {
  t: number
  cpu: number
}

/** Dashboard 系统总览:CPU/内存/磁盘活体读数 + CPU% 滑窗趋势图。 */
export default function Dashboard() {
  const { data, error, loading } = usePoll(fetchMetrics, POLL_MS)
  const [series, setSeries] = useState<Sample[]>([])

  useEffect(() => {
    if (!data) return
    setSeries((prev) => [...prev, { t: Date.now(), cpu: data.cpu_percent }].slice(-WINDOW))
  }, [data])

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
          <h2 className="text-sm font-medium text-muted">cpu 利用率趋势</h2>
          <span className="text-xs lowercase tracking-wide text-muted">
            最近 {WINDOW} 个采样
          </span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={levelStroke[cpuLevel]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={levelStroke[cpuLevel]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: 'var(--color-border)' }}
                contentStyle={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={() => ''}
                formatter={(v) => [`${Number(v).toFixed(1)}%`, 'cpu']}
              />
              <Area
                type="monotone"
                dataKey="cpu"
                stroke={levelStroke[cpuLevel]}
                strokeWidth={1.5}
                fill="url(#cpuFill)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
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
