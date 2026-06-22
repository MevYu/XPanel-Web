import { Card } from '../../components/Card'
import { formatBytes, formatRate } from '../../lib/format'
import type { DetailMetrics } from '../../api/types'
import type { NetRate } from './IoCard'

interface Props {
  detail: DetailMetrics | null
  net: NetRate[]
  error: boolean
}

/** TrafficCard aaPanel Traffic 卡:上行/下行实时速率 + 累计发送/接收总量。 */
export function TrafficCard({ detail, net, error }: Props) {
  const tx = net.reduce((s, n) => s + n.tx, 0)
  const rx = net.reduce((s, n) => s + n.rx, 0)
  // detail.network 为累计计数器,所有网卡求和得总量。
  const totalSent = detail ? detail.network.reduce((s, n) => s + n.bytes_sent, 0) : 0
  const totalRecv = detail ? detail.network.reduce((s, n) => s + n.bytes_recv, 0) : 0

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-text">流量</h3>
      {error ? (
        <p className="text-sm text-muted">无法获取流量数据,稍后重试。</p>
      ) : !detail ? (
        <p className="text-sm text-muted">暂无数据。</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Cell label="上行" value={formatRate(tx)} dot="brand" />
          <Cell label="下行" value={formatRate(rx)} dot="online" />
          <Cell label="累计发送" value={formatBytes(totalSent)} />
          <Cell label="累计接收" value={formatBytes(totalRecv)} />
        </div>
      )}
    </Card>
  )
}

function Cell({ label, value, dot }: { label: string; value: string; dot?: 'brand' | 'online' }) {
  const dotColor = dot === 'brand' ? 'bg-brand' : dot === 'online' ? 'bg-online' : ''
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs text-muted">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />}
        {label}
      </span>
      <span className="font-[family-name:var(--font-mono)] text-lg font-medium leading-none tabular-nums text-text">
        {value}
      </span>
    </div>
  )
}
