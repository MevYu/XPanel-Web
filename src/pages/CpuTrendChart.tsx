import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface Sample {
  t: number
  cpu: number
}

/** CPU% 滑窗趋势图。单独成块以便 React.lazy 懒加载,把 recharts 移出首屏主包。 */
export default function CpuTrendChart({
  series,
  stroke,
}: {
  series: Sample[]
  stroke: string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
      <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
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
          stroke={stroke}
          strokeWidth={1.5}
          fill="url(#cpuFill)"
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
