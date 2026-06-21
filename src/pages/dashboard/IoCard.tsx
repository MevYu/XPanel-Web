import { Card } from '../../components/Card'
import { formatBytes, formatRate } from '../../lib/format'
import type { DetailMetrics } from '../../api/types'

export interface DiskRate {
  name: string
  read: number
  write: number
  readOps: number
  writeOps: number
}

export interface NetRate {
  name: string
  rx: number
  tx: number
}

interface Props {
  detail: DetailMetrics | null
  disk: DiskRate[]
  net: NetRate[]
  error: boolean
}

/** IoCard IO 面板卡:磁盘 IOPS/吞吐(差分)、CPU iowait、网络速率+累计总量。 */
export function IoCard({ detail, disk, net, error }: Props) {
  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-text">IO 面板</h3>
      {error ? (
        <p className="text-sm text-muted">无法获取 IO 指标,稍后重试。</p>
      ) : !detail ? (
        <p className="text-sm text-muted">暂无数据。</p>
      ) : (
        <Body detail={detail} disk={disk} net={net} />
      )}
    </Card>
  )
}

function Body({ detail, disk, net }: { detail: DetailMetrics; disk: DiskRate[]; net: NetRate[] }) {
  // 全机聚合:吞吐与 IOPS 按设备求和。
  const readBps = disk.reduce((s, d) => s + d.read, 0)
  const writeBps = disk.reduce((s, d) => s + d.write, 0)
  const iops = disk.reduce((s, d) => s + d.readOps + d.writeOps, 0)
  const rx = net.reduce((s, n) => s + n.rx, 0)
  const tx = net.reduce((s, n) => s + n.tx, 0)
  // 网络累计总量取所有网卡之和(detail 为累计计数器)。
  const totalRecv = detail.network.reduce((s, n) => s + n.bytes_recv, 0)
  const totalSent = detail.network.reduce((s, n) => s + n.bytes_sent, 0)
  // 旧后端可能无 cpu_iowait_percent,缺失按 0。
  const iowait = detail.cpu_iowait_percent ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="IOPS" value={iops.toFixed(0)} />
        <Metric label="CPU iowait" value={`${iowait.toFixed(1)}%`} />
        <Metric label="磁盘读" value={formatRate(readBps)} />
        <Metric label="磁盘写" value={formatRate(writeBps)} />
      </div>
      <div className="h-px bg-border" aria-hidden />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="网络 ↓" value={formatRate(rx)} accent="online" />
        <Metric label="网络 ↑" value={formatRate(tx)} accent="brand" />
        <Metric label="累计接收" value={formatBytes(totalRecv)} />
        <Metric label="累计发送" value={formatBytes(totalSent)} />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'online' | 'brand'
}) {
  const color = accent === 'online' ? 'text-online' : accent === 'brand' ? 'text-brand' : 'text-text'
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span
        className={`font-[family-name:var(--font-mono)] text-lg font-medium leading-none tabular-nums ${color}`}
      >
        {value}
      </span>
    </div>
  )
}
