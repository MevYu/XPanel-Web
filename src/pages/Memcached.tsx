import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Stat } from '../components/Stat'
import { Spinner } from '../components/Spinner'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

interface Stats {
  pid: number
  uptime: number
  version: string
  curr_connections: number
  total_connections: number
  curr_items: number
  total_items: number
  bytes: number
  limit_maxbytes: number
  get_hits: number
  get_misses: number
  cmd_get: number
  cmd_set: number
  evictions: number
  hit_rate: number
  mem_usage_rate: number
}

type Slabs = Record<string, Record<string, string>>

interface Settings {
  addr: string
  service_unit: string
}

function fmtBytes(n: number): string {
  if (n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return d > 0 ? `${d}天 ${h}时` : h > 0 ? `${h}时 ${m}分` : `${m}分`
}

/** Memcached:查看 stats(命中率/连接/内存/items)与 slabs,启停/重启服务,flush 清空缓存(危险)。 */
export default function Memcached() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [stats, setStats] = useState<Stats | null>(null)
  const [slabs, setSlabs] = useState<Slabs>({})
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [st, sl, se] = await Promise.all([
        apiFetch<Stats>('/api/m/memcached/stats'),
        apiFetch<Slabs>('/api/m/memcached/slabs'),
        apiFetch<Settings>('/api/m/memcached/settings'),
      ])
      setStats(st)
      setSlabs(sl ?? {})
      setSettings(se)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function action(verb: 'start' | 'stop' | 'restart') {
    if (busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/memcached/${verb}`, { method: 'POST' })
      setFeedback({ kind: 'ok', text: `服务已${verb === 'start' ? '启动' : verb === 'stop' ? '停止' : '重启'}` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function flush() {
    if (busy || !isAdmin) return
    if (!window.confirm('确认清空所有缓存(flush_all)?此操作危险且不可恢复。')) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/memcached/flush', { method: 'POST', headers: DANGER })
      setFeedback({ kind: 'ok', text: '缓存已清空' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings() {
    if (!settings || busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<Settings>('/api/m/memcached/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setSettings(res)
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  const slabIds = Object.keys(slabs).sort((a, b) => Number(a) - Number(b))

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text">服务控制</h2>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void action('start')} disabled={busy || !isAdmin}>
            启动
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void action('restart')} disabled={busy || !isAdmin}>
            重启
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void action('stop')} disabled={busy || !isAdmin}>
            停止
          </Button>
          <Button size="sm" variant="danger" onClick={() => void flush()} disabled={busy || !isAdmin}>
            清空缓存
          </Button>
          {busy && <Spinner size={16} />}
        </div>
        {!isAdmin && <p className="text-xs text-muted">服务控制与设置需要 admin 角色。</p>}
      </Card>

      {loadErr && !stats ? (
        <Card>
          <p className="text-sm text-muted">{loadErr}</p>
        </Card>
      ) : (
        stats && (
          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-text">运行状态</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat value={`${(stats.hit_rate * 100).toFixed(1)}%`} label="命中率" />
              <Stat value={`${(stats.mem_usage_rate * 100).toFixed(1)}%`} label="内存使用率" />
              <Stat value={stats.curr_connections} label="当前连接" />
              <Stat value={stats.curr_items} label="items" />
              <Stat value={fmtBytes(stats.bytes)} label="已用内存" />
              <Stat value={fmtBytes(stats.limit_maxbytes)} label="内存上限" />
              <Stat value={stats.evictions} label="evictions" />
              <Stat value={fmtUptime(stats.uptime)} label="运行时长" />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
              <span>版本 {stats.version || '—'}</span>
              <span>PID {stats.pid}</span>
              <span>get_hits {stats.get_hits}</span>
              <span>get_misses {stats.get_misses}</span>
              <span>cmd_get {stats.cmd_get}</span>
              <span>cmd_set {stats.cmd_set}</span>
            </div>
          </Card>
        )
      )}

      {slabIds.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text">Slabs</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium">slab</th>
                  <th className="py-2 pr-4 font-medium">chunk_size</th>
                  <th className="py-2 pr-4 font-medium">chunks_per_page</th>
                  <th className="py-2 pr-4 font-medium">used_chunks</th>
                  <th className="py-2 pr-4 font-medium">free_chunks</th>
                </tr>
              </thead>
              <tbody className="font-[family-name:var(--font-mono)] text-text">
                {slabIds.map((id) => {
                  const s = slabs[id]
                  return (
                    <tr key={id} className="border-b border-border/60">
                      <td className="py-1.5 pr-4">{id}</td>
                      <td className="py-1.5 pr-4">{s.chunk_size ?? '—'}</td>
                      <td className="py-1.5 pr-4">{s.chunks_per_page ?? '—'}</td>
                      <td className="py-1.5 pr-4">{s.used_chunks ?? '—'}</td>
                      <td className="py-1.5 pr-4">{s.free_chunks ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {settings && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">服务设置</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="memcached 地址 (addr)"
              placeholder="127.0.0.1:11211"
              className="font-[family-name:var(--font-mono)]"
              spellCheck={false}
              value={settings.addr}
              onChange={(e) => setSettings((s) => (s ? { ...s, addr: e.target.value } : s))}
            />
            <Input
              label="systemd 单元 (service_unit)"
              placeholder="memcached.service"
              className="font-[family-name:var(--font-mono)]"
              spellCheck={false}
              value={settings.service_unit}
              onChange={(e) => setSettings((s) => (s ? { ...s, service_unit: e.target.value } : s))}
            />
          </div>
          <div>
            <Button onClick={() => void saveSettings()} disabled={busy || !isAdmin}>
              保存设置
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
