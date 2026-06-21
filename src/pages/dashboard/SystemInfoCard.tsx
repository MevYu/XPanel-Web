import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Card } from '../../components/Card'
import { Sparkline } from '../../components/Sparkline'
import { formatDuration, formatRate } from '../../lib/format'
import { formatTime } from '../../lib/formatTime'
import type { DetailMetrics } from '../../api/types'

interface SysInfo {
  hostname: string
  os: string
  kernel: string
  arch: string
  private_ip: string
  public_ip: string
  panel_version: string
  server_time: number
}

interface NetRate {
  name: string
  rx: number
  tx: number
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className="text-xs text-muted">{k}</div>
      <div className="truncate font-[family-name:var(--font-mono)] text-[13px] text-text" title={v}>
        {v || '—'}
      </div>
    </>
  )
}

/** SystemInfoCard 系统信息卡:主机/系统/内核/IP 等键值 + 网络速率 + 迷你折线(对标设计稿 System Info)。 */
export function SystemInfoCard({
  detail,
  net,
  netHistory,
}: {
  detail: DetailMetrics | null
  net: NetRate[]
  netHistory: Record<string, { rx: number[]; tx: number[] }>
}) {
  const [info, setInfo] = useState<SysInfo | null>(null)
  useEffect(() => {
    apiFetch<SysInfo>('/api/m/dashboard/sysinfo')
      .then(setInfo)
      .catch(() => {})
  }, [])

  const rx = net.reduce((s, n) => s + n.rx, 0)
  const tx = net.reduce((s, n) => s + n.tx, 0)
  // 各网卡 rx 历史按位求和,作一条总吞吐折线。
  const rxHist = Object.values(netHistory).reduce<number[]>((acc, h) => {
    h.rx.forEach((v, i) => (acc[i] = (acc[i] ?? 0) + v))
    return acc
  }, [])

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-text">系统信息</h3>
      <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr_auto_1fr]">
        <Row k="主机名" v={info?.hostname ?? ''} />
        <Row k="面板" v={info?.panel_version ? `XPanel ${info.panel_version}` : ''} />
        <Row k="系统" v={info?.os ?? ''} />
        <Row k="内核" v={info?.kernel ?? ''} />
        <Row k="运行时长" v={detail ? formatDuration(detail.uptime_sec) : ''} />
        <Row k="架构" v={info?.arch ?? ''} />
        <Row k="服务器时间" v={info?.server_time ? formatTime(info.server_time) : ''} />
        <Row k="公网 IP" v={info?.public_ip ?? ''} />
        <Row k="内网 IP" v={info?.private_ip ?? ''} />
      </div>
      <div className="h-px bg-border" />
      <div className="flex items-center gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted">网络 ↓ / ↑</span>
          <span className="font-[family-name:var(--font-mono)] text-sm tabular-nums text-text">
            {formatRate(rx)} / {formatRate(tx)}
          </span>
        </div>
        {rxHist.length >= 2 && (
          <div className="ml-auto">
            <Sparkline data={rxHist} width={168} height={36} />
          </div>
        )}
      </div>
    </Card>
  )
}
