import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatRate } from '../../lib/format'

export interface RatePoint {
  t: number
  a: number
  b: number
}

interface Props {
  series: RatePoint[]
  /** a 系列(上行/写)标签与配色,默认 --color-brand。 */
  labelA: string
  /** b 系列(下行/读)标签与配色,默认 --color-online。 */
  labelB: string
}

const COLOR_A = 'var(--color-brand)'
const COLOR_B = 'var(--color-online)'

/** 流量/磁盘 IO 双线实时面积图。单独成块供 React.lazy 懒加载,把 recharts 移出首屏主包。 */
export default function TrafficChart({ series, labelA, labelB }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
      <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="trafficFillA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_A} stopOpacity={0.3} />
            <stop offset="100%" stopColor={COLOR_A} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="trafficFillB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_B} stopOpacity={0.3} />
            <stop offset="100%" stopColor={COLOR_B} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="t" hide />
        <YAxis
          tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          tickFormatter={(v) => formatRate(Number(v))}
          axisLine={false}
          tickLine={false}
          width={64}
          domain={[0, 'auto']}
        />
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: 'var(--color-border-strong)' }}
          contentStyle={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={() => ''}
          formatter={(value, name) => [formatRate(Number(value)), name]}
        />
        <Area
          type="monotone"
          dataKey="a"
          name={labelA}
          stroke={COLOR_A}
          strokeWidth={1.5}
          fill="url(#trafficFillA)"
          isAnimationActive={false}
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="b"
          name={labelB}
          stroke={COLOR_B}
          strokeWidth={1.5}
          fill="url(#trafficFillB)"
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
