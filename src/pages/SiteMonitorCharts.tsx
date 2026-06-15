import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export interface TrendPoint {
  bucket: string
  requests: number
  bytes: number
}

export interface StatusSlice {
  name: string
  value: number
  color: string
}

/** 趋势面积图 + 状态码分布饼图。单独成块以便 React.lazy,把 recharts 移出首屏主包。 */
export default function SiteMonitorCharts({
  trend,
  status,
}: {
  trend: TrendPoint[]
  status: StatusSlice[]
}) {
  const hasStatus = status.some((s) => s.value > 0)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="smReq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="bucket"
              tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5, 16).replace('T', ' ')}
              axisLine={false}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--color-text)' }}
            />
            <Area
              type="monotone"
              dataKey="requests"
              name="请求数"
              stroke="var(--color-brand)"
              fill="url(#smReq)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="h-64">
        {hasStatus ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={status} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%">
                {status.map((s) => (
                  <Cell key={s.name} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            暂无状态码数据
          </div>
        )}
      </div>
    </div>
  )
}
