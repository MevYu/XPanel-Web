import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { apiFetch } from '../../api/client'
import { useModules } from '../../hooks/useModules'

interface MalscanTask {
  flagged_count: number
}

function fetchBanned(): Promise<number> {
  return apiFetch<string[]>('/api/m/security/fail2ban/banned').then((a) =>
    Array.isArray(a) ? a.length : 0,
  )
}

function fetchHits(): Promise<number> {
  return apiFetch<MalscanTask[]>('/api/m/malscan/tasks').then((a) =>
    Array.isArray(a) ? a.reduce((s, t) => s + (t.flagged_count || 0), 0) : 0,
  )
}

interface Risk {
  label: string
  to: string
}

/** AlertBar 顶部告警条:聚合未处理安全风险(被封 IP、木马命中);有风险出警告横幅,无则极简"系统正常"。 */
export function AlertBar() {
  const { enabled } = useModules()
  const hasSecurity = enabled.some((m) => m.id === 'security')
  const hasMalscan = enabled.some((m) => m.id === 'malscan')
  const [banned, setBanned] = useState(0)
  const [hits, setHits] = useState(0)

  useEffect(() => {
    let alive = true
    if (hasSecurity) {
      fetchBanned()
        .then((n) => alive && setBanned(n))
        .catch(() => alive && setBanned(0))
    }
    if (hasMalscan) {
      fetchHits()
        .then((n) => alive && setHits(n))
        .catch(() => alive && setHits(0))
    }
    return () => {
      alive = false
    }
  }, [hasSecurity, hasMalscan])

  const risks: Risk[] = []
  if (hits > 0) risks.push({ label: `木马命中 ${hits} 处`, to: '/malscan' })
  if (banned > 0) risks.push({ label: `被封 IP ${banned} 个`, to: '/security' })

  if (risks.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-(--radius-card) border border-border bg-surface px-4 py-2.5 text-sm text-muted">
        <ShieldCheck size={16} className="text-online" />
        系统正常,无未处理安全风险。
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-(--radius-card) border border-warn/25 bg-warn-soft px-4 py-2.5 text-sm">
      <span className="flex items-center gap-2 font-medium text-warn">
        <ShieldAlert size={16} />
        发现 {risks.length} 项未处理安全风险
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        {risks.map((r) => (
          <Link key={r.label} to={r.to} className="text-warn underline-offset-2 hover:underline">
            {r.label}
          </Link>
        ))}
      </span>
    </div>
  )
}
