import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, KeyRound, Bug, type LucideIcon } from 'lucide-react'
import { apiFetch } from '../../api/client'
import { Card } from '../../components/Card'
import { useModules } from '../../hooks/useModules'

interface LoginEntry {
  user: string
  ip: string
  when: string
  failed: boolean
}

interface MalscanTask {
  flagged_count: number
}

// 每段独立计数:null = 拉取失败/模块未启用,渲染为"—"。
interface SecState {
  banned: number | null
  failed24h: number | null
  hits: number | null
}

// 近 24h 失败登录:logins 的 when 是字符串(lastb 输出),无法可靠解析时间,
// 故退而取后端按时间倒序返回的最近 200 条作为近况近似,直接计数。
const FAILED_LIMIT = 200

function fetchBanned(): Promise<number> {
  return apiFetch<string[]>('/api/m/security/fail2ban/banned').then((a) =>
    Array.isArray(a) ? a.length : 0,
  )
}

function fetchFailedLogins(): Promise<number> {
  return apiFetch<LoginEntry[]>(`/api/m/security/logins?failed=true&limit=${FAILED_LIMIT}`).then(
    (a) => (Array.isArray(a) ? a.length : 0),
  )
}

function fetchHits(): Promise<number> {
  return apiFetch<MalscanTask[]>('/api/m/malscan/tasks').then((a) =>
    Array.isArray(a) ? a.reduce((s, t) => s + (t.flagged_count || 0), 0) : 0,
  )
}

interface Seg {
  label: string
  icon: LucideIcon
  to: string
  value: number | null
}

/** SecurityCard 安全面板卡:聚合 fail2ban 被封 IP、失败登录、木马命中,各段独立降级。 */
export function SecurityCard() {
  const { enabled } = useModules()
  const hasSecurity = enabled.some((m) => m.id === 'security')
  const hasMalscan = enabled.some((m) => m.id === 'malscan')
  const [st, setSt] = useState<SecState>({ banned: null, failed24h: null, hits: null })

  useEffect(() => {
    let alive = true
    if (hasSecurity) {
      fetchBanned()
        .then((n) => alive && setSt((s) => ({ ...s, banned: n })))
        .catch(() => alive && setSt((s) => ({ ...s, banned: null })))
      fetchFailedLogins()
        .then((n) => alive && setSt((s) => ({ ...s, failed24h: n })))
        .catch(() => alive && setSt((s) => ({ ...s, failed24h: null })))
    }
    if (hasMalscan) {
      fetchHits()
        .then((n) => alive && setSt((s) => ({ ...s, hits: n })))
        .catch(() => alive && setSt((s) => ({ ...s, hits: null })))
    }
    return () => {
      alive = false
    }
  }, [hasSecurity, hasMalscan])

  // 两个安全模块都没启用就不出卡。
  if (!hasSecurity && !hasMalscan) return null

  const segs: Seg[] = []
  if (hasSecurity) {
    segs.push({ label: '被封 IP', icon: Ban, to: '/security', value: st.banned })
    segs.push({ label: '失败登录', icon: KeyRound, to: '/security', value: st.failed24h })
  }
  if (hasMalscan) {
    segs.push({ label: '木马命中', icon: Bug, to: '/malscan', value: st.hits })
  }

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-text">安全面板</h3>
      <div className="grid grid-cols-3 gap-3">
        {segs.map((seg) => {
          const Icon = seg.icon
          const danger = (seg.value ?? 0) > 0
          return (
            <Link
              key={seg.label}
              to={seg.to}
              className="group flex flex-col gap-1.5 rounded-(--radius-sm) bg-surface-2 p-3 outline-none transition-colors hover:bg-elevated"
            >
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Icon size={14} className={danger ? 'text-crit' : 'text-muted'} />
                {seg.label}
              </span>
              <span
                className={`font-[family-name:var(--font-mono)] text-2xl font-medium leading-none tabular-nums ${
                  danger ? 'text-crit' : 'text-text'
                }`}
              >
                {seg.value == null ? '—' : seg.value}
              </span>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
