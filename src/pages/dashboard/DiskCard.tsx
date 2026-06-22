import { apiFetch } from '../../api/client'
import { usePoll } from '../../hooks/usePoll'
import { Card } from '../../components/Card'
import { formatBytes } from '../../lib/format'
import type { Metrics, DiskPartition } from '../../api/types'
import { clampPct, levelFor, levelStroke, levelText } from './Gauge'

const pct = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0)
const PART_POLL_MS = 5000

function fetchPartitions() {
  return apiFetch<DiskPartition[]>('/api/m/dashboard/disk-partitions')
}

/** DiskCard aaPanel Disk 卡:磁盘分区使用率列表(挂载点 + 用量条 + 已用/总量),分区缺失退回聚合磁盘单行。 */
export function DiskCard({ m }: { m: Metrics }) {
  // 分区端点失败/为空降级,不影响整页。
  const { data } = usePoll(fetchPartitions, PART_POLL_MS)
  const parts = data ?? []

  const rows: Row[] =
    parts.length > 0
      ? parts.map((p) => ({
          key: p.mountpoint || p.device,
          label: p.mountpoint,
          sub: p.device + (p.fstype ? ` · ${p.fstype}` : ''),
          used: p.used,
          total: p.total,
          usedPct: clampPct(p.used_percent),
        }))
      : [
          {
            key: 'agg',
            label: '/',
            sub: '磁盘',
            used: m.disk_used,
            total: m.disk_total,
            usedPct: clampPct(pct(m.disk_used, m.disk_total)),
          },
        ]

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-text">磁盘</h3>
      <div className="flex flex-col gap-3">
        {rows.map(({ key, ...r }) => (
          <PartRow key={key} {...r} />
        ))}
      </div>
    </Card>
  )
}

interface Row {
  key: string
  label: string
  sub: string
  used: number
  total: number
  usedPct: number
}

function PartRow({ label, sub, used, total, usedPct }: Omit<Row, 'key'>) {
  const level = levelFor(usedPct)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-[family-name:var(--font-mono)] text-[13px] text-text" title={`${label} · ${sub}`}>
          {label}
        </span>
        <span className="shrink-0 font-[family-name:var(--font-mono)] text-xs tabular-nums text-muted">
          {formatBytes(used)} / {formatBytes(total)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
            style={{ width: `${usedPct}%`, background: levelStroke[level] }}
          />
        </div>
        <span className={`w-10 shrink-0 text-right font-[family-name:var(--font-mono)] text-xs tabular-nums ${levelText[level]}`}>
          {usedPct.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}
