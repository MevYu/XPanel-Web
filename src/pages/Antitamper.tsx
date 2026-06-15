import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function fmtTime(unix: number): string {
  return unix ? new Date(unix * 1000).toLocaleString() : '—'
}

type Feedback = { kind: 'ok' | 'err'; text: string } | null

interface Settings {
  protected_dirs: string[]
  exclude_rules: string[]
  interval_sec: number
  paused: boolean
}

interface TamperEvent {
  id: number
  path: string
  type: 'added' | 'deleted' | 'modified'
  old_hash: string
  new_hash: string
  detected_at: number
}

function typeBadge(t: TamperEvent['type']): 'online' | 'warn' | 'crit' | 'neutral' {
  if (t === 'added') return 'online'
  if (t === 'modified') return 'warn'
  if (t === 'deleted') return 'crit'
  return 'neutral'
}

/** Antitamper 防篡改:受保护目录与排除规则设置、重建基线、暂停/恢复、篡改事件列表。 */
export default function Antitamper() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  return (
    <div className="flex flex-col gap-4">
      {isAdmin ? (
        <Control />
      ) : (
        <Card>
          <p className="text-sm text-muted">防篡改配置需要 admin 角色,以下为只读事件列表。</p>
        </Card>
      )}
      <Events />
    </div>
  )
}

function Control() {
  const [cfg, setCfg] = useState<Settings | null>(null)
  const [baselineFiles, setBaselineFiles] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirsText, setDirsText] = useState('')
  const [excludeText, setExcludeText] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([
        apiFetch<Settings>('/api/m/antitamper/settings'),
        apiFetch<{ files: number }>('/api/m/antitamper/baseline'),
      ])
      setCfg(s)
      setDirsText(s.protected_dirs.join('\n'))
      setExcludeText(s.exclude_rules.join('\n'))
      setBaselineFiles(b.files)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function linesOf(text: string): string[] {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  }

  async function saveSettings() {
    if (!cfg) return
    setBusy(true)
    setFeedback(null)
    try {
      const next: Settings = {
        ...cfg,
        protected_dirs: linesOf(dirsText),
        exclude_rules: linesOf(excludeText),
      }
      const saved = await apiFetch<Settings>('/api/m/antitamper/settings', {
        method: 'PUT',
        body: JSON.stringify(next),
      })
      setCfg(saved)
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function rebuild() {
    if (!window.confirm('确认重建基线?当前全部受保护文件的指纹将作为新的可信状态。')) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<{ files: number }>('/api/m/antitamper/baseline', { method: 'POST' })
      setBaselineFiles(res.files)
      setFeedback({ kind: 'ok', text: `基线已重建,共 ${res.files} 个文件` })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function setPaused(paused: boolean) {
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<{ paused: boolean }>(
        `/api/m/antitamper/${paused ? 'pause' : 'resume'}`,
        { method: 'POST' },
      )
      setCfg((c) => (c ? { ...c, paused: res.paused } : c))
      setFeedback({ kind: 'ok', text: res.paused ? '监控已暂停' : '监控已恢复' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="flex h-24 items-center justify-center">
          <Spinner size={24} />
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-text">防篡改控制</h2>
          {cfg && (
            <Badge status={cfg.paused ? 'warn' : 'online'}>{cfg.paused ? '已暂停' : '监控中'}</Badge>
          )}
          {baselineFiles !== null && (
            <span className="text-xs text-muted">基线 {baselineFiles} 个文件</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {busy && <Spinner size={16} />}
          {cfg?.paused ? (
            <Button size="sm" onClick={() => void setPaused(false)} disabled={busy}>
              恢复监控
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => void setPaused(true)} disabled={busy}>
              暂停监控
            </Button>
          )}
          <Button size="sm" onClick={() => void rebuild()} disabled={busy}>
            重建基线
          </Button>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">受保护目录(每行一个绝对路径)</span>
        <textarea
          value={dirsText}
          rows={3}
          spellCheck={false}
          placeholder="/www/wwwroot"
          onChange={(e) => setDirsText(e.target.value)}
          className="rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">排除规则(每行一个 glob)</span>
        <textarea
          value={excludeText}
          rows={3}
          spellCheck={false}
          placeholder="*.log"
          onChange={(e) => setExcludeText(e.target.value)}
          className="rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        />
      </label>

      <Input
        label="扫描间隔(秒)"
        inputMode="numeric"
        value={cfg ? String(cfg.interval_sec) : ''}
        onChange={(e) =>
          setCfg((c) => (c ? { ...c, interval_sec: Number(e.target.value) || 0 } : c))
        }
      />

      <div className="flex items-center gap-2">
        <Button onClick={() => void saveSettings()} disabled={busy}>
          保存设置
        </Button>
        <span className="text-xs text-muted">改目录或排除规则后建议重建基线。</span>
      </div>
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function Events() {
  const [events, setEvents] = useState<TamperEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setEvents(await apiFetch<TamperEvent[]>('/api/m/antitamper/events?limit=200'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card className="flex flex-col gap-4 p-0">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="text-sm font-medium text-text">篡改事件</h2>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          刷新
        </Button>
      </div>
      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : loadErr && events.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">{loadErr}</p>
      ) : events.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">暂无篡改事件。</p>
      ) : (
        <div className="divide-y divide-border px-5 pb-2">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-4 py-3">
              <Badge status={typeBadge(ev.type)}>{ev.type}</Badge>
              <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-xs text-text">
                {ev.path}
              </span>
              <span className="text-xs text-muted">{fmtTime(ev.detected_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
