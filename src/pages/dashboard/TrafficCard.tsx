import { lazy, Suspense, useState } from 'react'
import { Card } from '../../components/Card'
import { Spinner } from '../../components/Spinner'
import { formatBytes, formatRate } from '../../lib/format'
import type { DetailMetrics } from '../../api/types'
import type { NetRate } from './IoCard'
import type { RatePoint } from './TrafficChart'

const TrafficChart = lazy(() => import('./TrafficChart'))

/** 全机聚合的速率历史窗口:网络上/下行 + 磁盘写/读,各一条按时间排序的序列。 */
export interface TrafficHistory {
  net: RatePoint[]
  disk: RatePoint[]
}

interface Props {
  detail: DetailMetrics | null
  net: NetRate[]
  history: TrafficHistory
  error: boolean
}

type Tab = 'net' | 'disk'

type RateLevel = 'ok' | 'warn' | 'crit' | 'idle'

// 速率染色阈值(B/s):快=绿、中=黄、慢=红、闲置=中性(避免空闲全红刺眼)。可调。
const RATE_FAST = 512 * 1024
const RATE_MID = 64 * 1024

function rateLevel(bps: number): RateLevel {
  if (bps >= RATE_FAST) return 'ok'
  if (bps >= RATE_MID) return 'warn'
  if (bps > 0) return 'crit'
  return 'idle'
}

const rateColor: Record<RateLevel, string> = {
  ok: 'text-online',
  warn: 'text-warn',
  crit: 'text-crit',
  idle: 'text-muted',
}

/** TrafficCard aaPanel Traffic 卡:实时上下行/读写折线 + 累计总量,可切流量/磁盘 IO。 */
export function TrafficCard({ detail, net, history, error }: Props) {
  const [tab, setTab] = useState<Tab>('net')
  const tx = net.reduce((s, n) => s + n.tx, 0)
  const rx = net.reduce((s, n) => s + n.rx, 0)
  // detail.network 为累计计数器,所有网卡求和得总量。
  const totalSent = detail ? detail.network.reduce((s, n) => s + n.bytes_sent, 0) : 0
  const totalRecv = detail ? detail.network.reduce((s, n) => s + n.bytes_recv, 0) : 0

  // 磁盘瞬时速率取 history.disk 最新点(a=写、b=读,与图一致);累计读写按 detail.disk_io 求和。
  const lastDisk = history.disk[history.disk.length - 1]
  const diskWrite = lastDisk?.a ?? 0
  const diskRead = lastDisk?.b ?? 0
  const totalWrite = detail ? detail.disk_io.reduce((s, d) => s + d.write_bytes, 0) : 0
  const totalRead = detail ? detail.disk_io.reduce((s, d) => s + d.read_bytes, 0) : 0

  const isNet = tab === 'net'
  const series = isNet ? history.net : history.disk
  const labelA = isNet ? '上行' : '写'
  const labelB = isNet ? '下行' : '读'

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">{isNet ? '流量' : '磁盘 IO'}</h3>
        <Segmented tab={tab} onChange={setTab} />
      </div>
      {error ? (
        <p className="text-sm text-muted">无法获取流量数据,稍后重试。</p>
      ) : !detail ? (
        <p className="text-sm text-muted">暂无数据。</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <Cell
              label={isNet ? '上行' : '写'}
              value={formatRate(isNet ? tx : diskWrite)}
              dot="brand"
              valueClass={rateColor[rateLevel(isNet ? tx : diskWrite)]}
            />
            <Cell
              label={isNet ? '下行' : '读'}
              value={formatRate(isNet ? rx : diskRead)}
              dot="online"
              valueClass={rateColor[rateLevel(isNet ? rx : diskRead)]}
            />
            <Cell
              label={isNet ? '累计发送' : '累计写'}
              value={formatBytes(isNet ? totalSent : totalWrite)}
            />
            <Cell
              label={isNet ? '累计接收' : '累计读'}
              value={formatBytes(isNet ? totalRecv : totalRead)}
            />
          </div>
          <div className="h-44">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Spinner size={20} />
                </div>
              }
            >
              <TrafficChart series={series} labelA={labelA} labelB={labelB} />
            </Suspense>
          </div>
        </>
      )}
    </Card>
  )
}

function Segmented({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="inline-flex rounded-(--radius-card) border border-border/60 bg-surface-2 p-0.5 text-xs">
      <SegButton active={tab === 'net'} onClick={() => onChange('net')}>
        流量
      </SegButton>
      <SegButton active={tab === 'disk'} onClick={() => onChange('disk')}>
        磁盘 IO
      </SegButton>
    </div>
  )
}

function SegButton({
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
      className={`rounded-[7px] px-2.5 py-1 transition-colors ${
        active ? 'bg-surface text-text shadow-[var(--shadow-card)]' : 'text-muted hover:text-text'
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
  valueClass = 'text-text',
}: {
  label: string
  value: string
  dot?: 'brand' | 'online'
  valueClass?: string
}) {
  const dotColor = dot === 'brand' ? 'bg-brand' : dot === 'online' ? 'bg-online' : ''
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs text-muted">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />}
        {label}
      </span>
      <span
        className={`font-[family-name:var(--font-mono)] text-lg font-medium leading-none tabular-nums ${valueClass}`}
      >
        {value}
      </span>
    </div>
  )
}
