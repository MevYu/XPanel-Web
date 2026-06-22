import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { InstallGate } from '../components/InstallGate'
import {
  Play,
  RotateCcw,
  Square,
  Trash2,
  RefreshCw,
  Settings2,
  Gauge,
  MemoryStick,
  Plug,
  Boxes,
  Timer,
  Recycle,
  ArrowDownUp,
  Info,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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

interface SlabRow {
  id: string
  chunk_size: string
  chunks_per_page: string
  used_chunks: string
  free_chunks: string
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

function fmtNum(n: number): string {
  return n.toLocaleString()
}

interface MetricProps {
  icon: LucideIcon
  /** 暖色 tint class,贴合 aaPanel 状态页配色。 */
  tint: string
  value: string
  label: string
}

/** Metric aaPanel 风指标小卡:暖色图标 + 大号 mono 读数 + muted 标签,密度收紧。 */
function Metric({ icon: Icon, tint, value, label }: MetricProps) {
  return (
    <div className="flex items-center gap-3 rounded-(--radius-card) border border-border bg-surface-2/40 px-3.5 py-3">
      <Icon size={20} className={`shrink-0 ${tint}`} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-[family-name:var(--font-mono)] text-xl font-medium tabular-nums tracking-tight text-text">
          {value}
        </span>
        <span className="truncate text-xs text-muted">{label}</span>
      </div>
    </div>
  )
}

const SLAB_COLUMNS: Column<SlabRow>[] = [
  { key: 'id', header: 'slab', width: '80px', cell: (s) => <span className="font-[family-name:var(--font-mono)]">{s.id}</span> },
  { key: 'chunk_size', header: 'chunk_size', cell: (s) => <span className="font-[family-name:var(--font-mono)] text-muted">{s.chunk_size}</span> },
  { key: 'chunks_per_page', header: 'chunks/page', cell: (s) => <span className="font-[family-name:var(--font-mono)] text-muted">{s.chunks_per_page}</span> },
  { key: 'used_chunks', header: 'used', cell: (s) => <span className="font-[family-name:var(--font-mono)] text-muted">{s.used_chunks}</span> },
  { key: 'free_chunks', header: 'free', cell: (s) => <span className="font-[family-name:var(--font-mono)] text-muted">{s.free_chunks}</span> },
]

/** Memcached 状态页(aaPanel 布局):顶部连接状态 + 暖色指标卡网格,slabs 紧凑表,服务控制与 flush 走工具栏,设置进固定尺寸弹窗。 */
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [flushOpen, setFlushOpen] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      // settings 单独取:连不上 memcached 时 stats/slabs 失败,但设置仍可读可改。
      const se = await apiFetch<Settings>('/api/m/memcached/settings')
      setSettings(se)
      try {
        const [st, sl] = await Promise.all([
          apiFetch<Stats>('/api/m/memcached/stats'),
          apiFetch<Slabs>('/api/m/memcached/slabs'),
        ])
        setStats(st)
        setSlabs(sl ?? {})
      } catch (e) {
        setStats(null)
        setSlabs({})
        setLoadErr(errorText(e))
      }
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
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/memcached/flush', { method: 'POST', headers: DANGER })
      setFeedback({ kind: 'ok', text: '缓存已清空' })
      setFlushOpen(false)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const slabRows = useMemo<SlabRow[]>(() => {
    return Object.keys(slabs)
      .filter((id) => id !== '_global')
      .sort((a, b) => Number(a) - Number(b))
      .map((id) => {
        const s = slabs[id]
        return {
          id,
          chunk_size: s.chunk_size ?? '—',
          chunks_per_page: s.chunks_per_page ?? '—',
          used_chunks: s.used_chunks ?? '—',
          free_chunks: s.free_chunks ?? '—',
        }
      })
  }, [slabs])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <InstallGate moduleId="memcached">
    <div className="flex flex-col gap-4">
      {/* aaPanel 顶部信息条:展示 memcached 连接地址,与服务运行状态。 */}
      {settings && (
        <div className="flex items-center gap-2 rounded-(--radius-card) border border-border bg-surface-2/60 px-3 py-2 text-sm text-muted">
          <Info size={15} className="shrink-0 text-brand" />
          <span>memcached 地址:</span>
          <span className="font-[family-name:var(--font-mono)] text-xs text-text">{settings.addr}</span>
          {stats ? (
            <Badge status="online">已连接</Badge>
          ) : (
            <Badge status="neutral">未连接</Badge>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="md" disabled={busy || !isAdmin} onClick={() => void action('start')}>
            <Play size={15} />
            启动
          </Button>
          <Button variant="ghost" size="md" disabled={busy || !isAdmin} onClick={() => void action('restart')}>
            <RotateCcw size={15} />
            重启
          </Button>
          <Button variant="ghost" size="md" disabled={busy || !isAdmin} onClick={() => void action('stop')}>
            <Square size={15} />
            停止
          </Button>
          <Button variant="danger" size="md" disabled={busy || !isAdmin} onClick={() => setFlushOpen(true)}>
            <Trash2 size={15} />
            清空缓存
          </Button>
          {busy && <Spinner size={16} />}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="md" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} />
            连接设置
          </Button>
          <Button variant="ghost" size="md" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={15} />
            刷新
          </Button>
        </div>
      </div>

      {!isAdmin && (
        <p className="text-xs text-muted">服务控制、清空缓存与连接设置需要 admin 角色。</p>
      )}

      {feedback && (
        <p
          className={`rounded-(--radius-card) border px-3 py-2 text-sm ${
            feedback.kind === 'ok'
              ? 'border-online/40 bg-online/10 text-online'
              : 'border-crit/40 bg-crit/10 text-crit'
          }`}
        >
          {feedback.text}
        </p>
      )}

      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Metric icon={Gauge} tint="text-amber-400" value={`${(stats.hit_rate * 100).toFixed(1)}%`} label="命中率" />
            <Metric icon={MemoryStick} tint="text-orange-400" value={`${(stats.mem_usage_rate * 100).toFixed(1)}%`} label="内存使用率" />
            <Metric icon={Plug} tint="text-amber-400" value={fmtNum(stats.curr_connections)} label="当前连接" />
            <Metric icon={Boxes} tint="text-orange-400" value={fmtNum(stats.curr_items)} label="缓存 items" />
            <Metric icon={MemoryStick} tint="text-orange-400" value={fmtBytes(stats.bytes)} label="已用内存" />
            <Metric icon={MemoryStick} tint="text-amber-400" value={fmtBytes(stats.limit_maxbytes)} label="内存上限" />
            <Metric icon={Recycle} tint="text-rose-400" value={fmtNum(stats.evictions)} label="驱逐 evictions" />
            <Metric icon={Timer} tint="text-amber-400" value={fmtUptime(stats.uptime)} label="运行时长" />
          </div>

          <div className="rounded-(--radius-card) border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
              <ArrowDownUp size={14} className="text-muted" />
              命中明细
            </div>
            <dl className="grid gap-x-4 divide-border/60 sm:grid-cols-2 sm:divide-x">
              {[
                ['get_hits', fmtNum(stats.get_hits)],
                ['get_misses', fmtNum(stats.get_misses)],
                ['cmd_get', fmtNum(stats.cmd_get)],
                ['cmd_set', fmtNum(stats.cmd_set)],
                ['total_connections', fmtNum(stats.total_connections)],
                ['total_items', fmtNum(stats.total_items)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-4 py-2">
                  <dt className="font-[family-name:var(--font-mono)] text-xs text-muted">{k}</dt>
                  <dd className="truncate font-[family-name:var(--font-mono)] text-sm tabular-nums text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {slabRows.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Slabs</h2>
              <Table columns={SLAB_COLUMNS} rows={slabRows} rowKey={(s) => s.id} emptyText="暂无 slab" />
            </div>
          )}
        </>
      ) : (
        <div className="rounded-(--radius-card) border border-border bg-surface">
          <EmptyState
            icon={<Plug />}
            title="未连接到 memcached"
            hint={loadErr || '请确认 memcached 服务正在运行,或在「连接设置」中修正地址,然后点击「刷新」重试。'}
          />
          <div className="flex items-center justify-center gap-2 pb-10">
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
              连接设置
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void load()}>
              重试
            </Button>
          </div>
        </div>
      )}

      {flushOpen && (
        <Modal title="清空所有缓存" size="sm" onClose={() => (busy ? undefined : setFlushOpen(false))}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text">
              将对 memcached 执行 <span className="font-[family-name:var(--font-mono)] text-crit">flush_all</span>,
              清空全部缓存数据。此操作<span className="text-crit">危险且不可恢复</span>。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="md" disabled={busy} onClick={() => setFlushOpen(false)}>
                取消
              </Button>
              <Button variant="danger" size="md" disabled={busy || !isAdmin} onClick={() => void flush()}>
                确认清空
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {settingsOpen && settings && (
        <SettingsModal
          isAdmin={isAdmin}
          initial={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setSettings(s)
            setSettingsOpen(false)
            void load()
          }}
        />
      )}
    </div>
    </InstallGate>
  )
}

function SettingsModal({
  isAdmin,
  initial,
  onClose,
  onSaved,
}: {
  isAdmin: boolean
  initial: Settings
  onClose: () => void
  onSaved: (s: Settings) => void
}) {
  const [form, setForm] = useState<Settings>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (busy || !isAdmin) return
    setBusy(true)
    setErr(null)
    try {
      const res = await apiFetch<Settings>('/api/m/memcached/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      onSaved(res)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="连接设置" size="sm" onClose={() => (busy ? undefined : onClose())}>
      <div className="flex flex-col gap-4">
        <Input
          label="memcached 地址 (addr)"
          placeholder="127.0.0.1:11211"
          className="font-[family-name:var(--font-mono)]"
          spellCheck={false}
          value={form.addr}
          onChange={(e) => setForm({ ...form, addr: e.target.value })}
        />
        <Input
          label="systemd 单元 (service_unit)"
          placeholder="memcached.service"
          className="font-[family-name:var(--font-mono)]"
          spellCheck={false}
          value={form.service_unit}
          onChange={(e) => setForm({ ...form, service_unit: e.target.value })}
        />
        {!isAdmin && <p className="text-xs text-muted">修改设置需要 admin 角色。</p>}
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button size="md" disabled={busy || !isAdmin} onClick={() => void save()}>
            保存设置
          </Button>
        </div>
      </div>
    </Modal>
  )
}
