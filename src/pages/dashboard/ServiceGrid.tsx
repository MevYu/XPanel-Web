import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Server,
  Database,
  Code,
  Boxes,
  Box,
  ServerCog,
  FolderInput,
  Play,
  Square,
  RotateCw,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { apiFetch, tokenStore } from '../../api/client'
import { useModules } from '../../hooks/useModules'
import { useAuth } from '../../auth/AuthContext'
import { Card } from '../../components/Card'
import { Badge } from '../../components/Badge'
import { Spinner } from '../../components/Spinner'

// 危险操作(启停/重启服务)请求头;后端要求 admin + 此头,UI 角色门非权威。
const DANGER = { 'X-Confirm-Danger': '1' }

type Verb = 'start' | 'stop' | 'restart'

const verbLabel: Record<Verb, string> = { start: '启动', stop: '停止', restart: '重启' }

// ServiceItem 取 /api/m/service/services 返回字段子集(就近定义,不动共享 types)。
interface ServiceItem {
  name: string
  active: string // systemd ActiveState:active / failed / inactive 等
  version: string
}

// Runtime 描述一类"运行环境"软件:匹配 systemd 单元基名、展示名、图标与图标语义色。
interface Runtime {
  re: RegExp
  label: string
  icon: LucideIcon
  color: string
}

// 运行环境目录:对标 aaPanel 首页只展示 LNMP 这类常驻服务,而非全量 systemd 单元(全量在「服务管理」页)。
// 数组顺序即网格展示与排序顺序:web → 数据库 → 运行时 → 缓存 → 其它。
const RUNTIME: Runtime[] = [
  { re: /^nginx$/, label: 'Nginx', icon: Server, color: 'text-emerald-400' },
  { re: /^(apache2|httpd)$/, label: 'Apache', icon: Server, color: 'text-rose-400' },
  { re: /^tengine$/, label: 'Tengine', icon: Server, color: 'text-emerald-400' },
  { re: /^(openresty)$/, label: 'OpenResty', icon: Server, color: 'text-emerald-400' },
  { re: /^(mysql|mysqld|mariadb)$/, label: 'MySQL', icon: Database, color: 'text-sky-400' },
  { re: /^(postgresql|postgres)/, label: 'PostgreSQL', icon: Database, color: 'text-sky-400' },
  { re: /^(mongod|mongodb)$/, label: 'MongoDB', icon: Database, color: 'text-emerald-400' },
  { re: /^php[\d.]*-?fpm$/, label: 'PHP-FPM', icon: Code, color: 'text-indigo-400' },
  { re: /^redis(-server)?$/, label: 'Redis', icon: Boxes, color: 'text-rose-400' },
  { re: /^memcached$/, label: 'Memcached', icon: Boxes, color: 'text-amber-400' },
  { re: /^(pure-ftpd|vsftpd|proftpd)$/, label: 'FTP', icon: FolderInput, color: 'text-gold' },
  { re: /^docker$/, label: 'Docker', icon: Box, color: 'text-sky-400' },
  { re: /^(supervisor|supervisord)$/, label: 'Supervisor', icon: ServerCog, color: 'text-violet-400' },
]

// runtimeOf 把 systemd 单元名匹配到运行环境目录项;非已知运行环境返回 null(首页不展示)。
function runtimeOf(unit: string): { rt: Runtime; order: number } | null {
  const base = unit.replace(/\.service$/, '')
  for (let i = 0; i < RUNTIME.length; i++) {
    if (RUNTIME[i].re.test(base)) return { rt: RUNTIME[i], order: i }
  }
  return null
}

// Tile 是单张运行环境卡的渲染数据:unit 为真实单元名(启停调用用),label 为展示名。
interface Tile {
  unit: string
  label: string
  icon: LucideIcon
  color: string
  active: string
  version: string
  order: number
}

// toTiles 过滤出已知运行环境服务并按目录顺序排序(多版本 PHP 等同类按单元名稳定排列)。
function toTiles(services: ServiceItem[]): Tile[] {
  const tiles: Tile[] = []
  for (const s of services) {
    const m = runtimeOf(s.name)
    if (!m) continue
    // PHP-FPM 单元常带版本(php8.2-fpm → "PHP-FPM 8.2"),其余用目录展示名。
    const ver = s.name.match(/(\d+\.\d+)/)?.[1]
    const label = m.rt.label === 'PHP-FPM' && ver ? `PHP-FPM ${ver}` : m.rt.label
    tiles.push({
      unit: s.name,
      label,
      icon: m.rt.icon,
      color: m.rt.color,
      active: s.active,
      version: s.version,
      order: m.order,
    })
  }
  tiles.sort((a, b) => a.order - b.order || a.unit.localeCompare(b.unit))
  return tiles
}

function statusBadge(active: string) {
  if (active === 'active') return <Badge status="online">运行中</Badge>
  if (active === 'failed') return <Badge status="crit">失败</Badge>
  if (active === 'activating' || active === 'deactivating')
    return <Badge status="warn">{active}</Badge>
  return <Badge status="neutral">已停止</Badge>
}

// callVerb 启停端点返回 text/plain,不能走强制 JSON 的 apiFetch;裸 fetch 自带 Bearer + 危险头。
async function callVerb(verb: Verb, unit: string): Promise<void> {
  const t = tokenStore.get()
  const headers: Record<string, string> = t
    ? { ...DANGER, Authorization: `Bearer ${t.access}` }
    : { ...DANGER }
  const res = await fetch(`/api/m/service/${verb}?unit=${encodeURIComponent(unit)}`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) throw new Error((await res.text()).trim() || `操作失败 (${res.status})`)
}

/**
 * ServiceGrid aaPanel「运行环境」:可控常驻服务(Nginx/MySQL/PHP-FPM/Redis…)网格,
 * 状态点 + 启动/停止/重启(写操作走 service 模块,需 admin + 危险头)。
 * service 模块未启用 → 引导启用;列表不可用/为空 → 降级提示,绝不整页崩或弹 404。
 */
export function ServiceGrid() {
  const { enabled, loading: modulesLoading } = useModules()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const serviceOn = enabled.some((m) => m.id === 'service')

  const [services, setServices] = useState<ServiceItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const data = await apiFetch<ServiceItem[]>('/api/m/service/services')
      setServices(Array.isArray(data) ? data : [])
    } catch (e) {
      const msg = e instanceof Error ? e.message.trim() : ''
      setErr(msg || '运行环境暂不可用')
      setServices(null)
    }
  }, [])

  useEffect(() => {
    if (serviceOn) void load()
  }, [serviceOn, load])

  const tiles = useMemo(() => (services ? toTiles(services) : []), [services])

  const act = useCallback(
    async (unit: string, verb: Verb) => {
      if (!isAdmin) return
      // 停止/重启为危险操作,二次确认;后端权威校验为准。
      if (
        (verb === 'stop' || verb === 'restart') &&
        !window.confirm(`确认${verbLabel[verb]}服务「${unit}」?`)
      )
        return
      setBusy(unit)
      setNote(null)
      try {
        await callVerb(verb, unit)
        setNote({ kind: 'ok', text: `已对 ${unit} 执行${verbLabel[verb]}` })
        await load()
      } catch (e) {
        setNote({ kind: 'err', text: e instanceof Error ? e.message : '操作失败' })
      } finally {
        setBusy(null)
      }
    },
    [isAdmin, load],
  )

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-sm font-medium text-text">运行环境</h3>
          {serviceOn && tiles.length > 0 && (
            <span className="font-[family-name:var(--font-mono)] text-xs tabular-nums text-muted">
              {tiles.filter((t) => t.active === 'active').length}/{tiles.length} 运行中
            </span>
          )}
        </div>
        {serviceOn && (
          <div className="flex items-center gap-3">
            {!isAdmin && <span className="text-xs text-muted">操作需 admin</span>}
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-sm text-xs text-muted outline-none transition hover:text-text focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <RefreshCw size={13} />
              刷新
            </button>
          </div>
        )}
      </div>

      {note && (
        <p className={`text-xs ${note.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{note.text}</p>
      )}

      {!serviceOn ? (
        modulesLoading ? (
          <Center>
            <Spinner size={20} />
          </Center>
        ) : (
          <DisabledHint />
        )
      ) : err ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted">{err}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-(--radius-sm) border border-border bg-surface-2/60 px-3 py-1.5 text-xs text-text outline-none transition hover:border-border-strong focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            重试
          </button>
        </div>
      ) : services === null ? (
        <Center>
          <Spinner size={20} />
        </Center>
      ) : tiles.length === 0 ? (
        <DisabledHint
          title="未检测到运行环境服务"
          hint="Nginx / MySQL / PHP / Redis 等未安装或未注册为 systemd 服务。"
          cta={false}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {tiles.map((t) => (
            <ServiceTile key={t.unit} tile={t} isAdmin={isAdmin} busy={busy === t.unit} onAct={act} />
          ))}
        </div>
      )}
    </Card>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-28 items-center justify-center">{children}</div>
}

// DisabledHint 运行环境不可接管时的引导/空态:大图标 + 文案,可选「去启用」CTA。
function DisabledHint({
  title = '运行环境未接管',
  hint = '启用「服务管理」模块后,可在此查看并启停 Nginx / MySQL / PHP / Redis 等运行环境。',
  cta = true,
}: {
  title?: string
  hint?: string
  cta?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="text-faint [&_svg]:h-12 [&_svg]:w-12 [&_svg]:stroke-[1.2]" aria-hidden>
        <ServerCog />
      </span>
      <span className="text-sm font-medium text-text">{title}</span>
      <span className="max-w-sm text-xs text-muted">{hint}</span>
      {cta && (
        <Link
          to="/modules"
          className="mt-1 inline-flex items-center gap-1.5 rounded-(--radius-sm) border border-border bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-text shadow-[var(--inset-hl)] outline-none transition hover:border-border-strong hover:bg-elevated focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <ServerCog size={14} />
          去启用「服务管理」
        </Link>
      )}
    </div>
  )
}

function ServiceTile({
  tile,
  isAdmin,
  busy,
  onAct,
}: {
  tile: Tile
  isAdmin: boolean
  busy: boolean
  onAct: (unit: string, verb: Verb) => void
}) {
  const Icon = tile.icon
  const running = tile.active === 'active'
  return (
    <div className="flex flex-col gap-3 rounded-(--radius-sm) border border-border/50 bg-surface-2/40 p-3.5 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-sm) bg-surface-2">
            <Icon size={18} className={tile.color} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-text" title={tile.unit}>
              {tile.label}
            </span>
            <span className="truncate font-[family-name:var(--font-mono)] text-[11px] text-muted">
              {tile.version ? `v${tile.version}` : tile.unit}
            </span>
          </div>
        </div>
        {statusBadge(tile.active)}
      </div>
      <div className="flex items-center gap-1.5">
        <Ctrl
          label="启动"
          icon={<Play size={13} />}
          disabled={!isAdmin || busy || running}
          onClick={() => onAct(tile.unit, 'start')}
        />
        <Ctrl
          label="重启"
          icon={<RotateCw size={13} />}
          disabled={!isAdmin || busy || !running}
          onClick={() => onAct(tile.unit, 'restart')}
        />
        <Ctrl
          label="停止"
          icon={<Square size={13} />}
          danger
          disabled={!isAdmin || busy || !running}
          onClick={() => onAct(tile.unit, 'stop')}
        />
        {busy && <Spinner size={14} className="ml-auto" />}
      </div>
    </div>
  )
}

function Ctrl({
  label,
  icon,
  danger,
  disabled,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  danger?: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex h-7 items-center gap-1 rounded-(--radius-sm) border px-2 text-xs transition outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'border-crit/30 text-crit hover:bg-crit-soft'
          : 'border-border text-muted hover:border-border-strong hover:text-text'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
