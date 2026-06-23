import { lazy, Suspense, useState } from 'react'
import { Card } from '../../components/Card'
import { Spinner } from '../../components/Spinner'
import { formatBytes, formatRate } from '../../lib/format'
import type { DetailMetrics } from '../../api/types'
import type { NetRate } from './IoCard'
import type { RatePoint } from './TrafficChart'

const TrafficChart = lazy(() => import('./TrafficChart'))

/**
 * 流量卡速率历史。net/disk 为全机聚合窗口;netByDevice/diskByDevice 按设备名索引各自窗口,
 * 供右上下拉选具体网卡/磁盘时单独取序列。
 */
export interface TrafficHistory {
  net: RatePoint[]
  disk: RatePoint[]
  netByDevice: Record<string, RatePoint[]>
  diskByDevice: Record<string, RatePoint[]>
}

interface Props {
  detail: DetailMetrics | null
  net: NetRate[]
  history: TrafficHistory
  error: boolean
}

type Tab = 'net' | 'disk'

// 下拉「全部」聚合所有设备的哨兵值(空串避免与真实设备名冲突)。
const ALL = ''

/** TrafficCard aaPanel Traffic 卡:实时上下行/读写折线 + 累计总量,可切流量/磁盘 IO、选具体设备。 */
export function TrafficCard({ detail, net, history, error }: Props) {
  const [tab, setTab] = useState<Tab>('net')
  // 选中设备名;切 tab 时复位为「全部」。
  const [device, setDevice] = useState<string>(ALL)

  const isNet = tab === 'net'
  const switchTab = (t: Tab) => {
    setTab(t)
    setDevice(ALL)
  }

  const devices = isNet
    ? detail?.network.map((n) => n.name) ?? []
    : detail?.disk_io.map((d) => d.name) ?? []

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <TabButton active={isNet} onClick={() => switchTab('net')}>
            流量
          </TabButton>
          <TabButton active={!isNet} onClick={() => switchTab('disk')}>
            磁盘 IO
          </TabButton>
        </div>
        <select
          value={device}
          onChange={(ev) => setDevice(ev.target.value)}
          className="h-8 rounded-(--radius-sm) border border-border bg-surface-2 px-2 text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          aria-label={isNet ? '选择网卡' : '选择磁盘'}
        >
          <option value={ALL}>全部</option>
          {devices.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="text-sm text-muted">无法获取流量数据,稍后重试。</p>
      ) : !detail ? (
        <p className="text-sm text-muted">暂无数据。</p>
      ) : (
        <Body detail={detail} net={net} history={history} tab={tab} device={device} />
      )}
    </Card>
  )
}

function Body({
  detail,
  net,
  history,
  tab,
  device,
}: {
  detail: DetailMetrics
  net: NetRate[]
  history: TrafficHistory
  tab: Tab
  device: string
}) {
  const isNet = tab === 'net'
  const all = device === ALL

  // 折线序列:全部取聚合窗口,具体设备取该设备窗口(缺失则空)。
  const byDevice = isNet ? history.netByDevice : history.diskByDevice
  const series = all ? (isNet ? history.net : history.disk) : byDevice[device] ?? []

  // 瞬时速率:全部聚合 net 求和 / disk 取聚合窗口最新点;具体设备取该设备窗口最新点。
  const aggSeries = isNet ? history.net : history.disk
  const lastAgg = aggSeries[aggSeries.length - 1]
  const devSeries = byDevice[device]
  const lastDev = devSeries?.[devSeries.length - 1]
  let rateA: number
  let rateB: number
  if (isNet) {
    rateA = all ? net.reduce((s, n) => s + n.tx, 0) : lastDev?.a ?? 0
    rateB = all ? net.reduce((s, n) => s + n.rx, 0) : lastDev?.b ?? 0
  } else {
    rateA = all ? lastAgg?.a ?? 0 : lastDev?.a ?? 0
    rateB = all ? lastAgg?.b ?? 0 : lastDev?.b ?? 0
  }

  // 累计总量:全部求和;具体设备取匹配项。
  let totalA: number
  let totalB: number
  if (isNet) {
    const ns = all ? detail.network : detail.network.filter((n) => n.name === device)
    totalA = ns.reduce((s, n) => s + n.bytes_sent, 0)
    totalB = ns.reduce((s, n) => s + n.bytes_recv, 0)
  } else {
    const ds = all ? detail.disk_io : detail.disk_io.filter((d) => d.name === device)
    totalA = ds.reduce((s, d) => s + d.write_bytes, 0)
    totalB = ds.reduce((s, d) => s + d.read_bytes, 0)
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Cell label={isNet ? '上行' : '写'} value={formatRate(rateA)} dot="brand" />
        <Cell label={isNet ? '下行' : '读'} value={formatRate(rateB)} dot="online" />
        <Cell label={isNet ? '累计发送' : '累计写'} value={formatBytes(totalA)} />
        <Cell label={isNet ? '累计接收' : '累计读'} value={formatBytes(totalB)} />
      </div>
      <div className="h-44">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner size={20} />
            </div>
          }
        >
          <TrafficChart series={series} labelA={isNet ? '上行' : '写'} labelB={isNet ? '下行' : '读'} />
        </Suspense>
      </div>
    </>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-1 pb-1.5 text-sm font-medium transition-colors ${
        active ? 'border-brand text-text' : 'border-transparent text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

function Cell({
  label,
  value,
  dot,
}: {
  label: string
  value: string
  dot?: 'brand' | 'online'
}) {
  const dotColor = dot === 'brand' ? 'bg-brand' : dot === 'online' ? 'bg-online' : ''
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs text-muted">
        {dot && (
          <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${dotColor}`} aria-hidden />
        )}
        {label}
      </span>
      <span className="font-[family-name:var(--font-mono)] text-lg font-medium leading-none tabular-nums text-text">
        {value}
      </span>
    </div>
  )
}
