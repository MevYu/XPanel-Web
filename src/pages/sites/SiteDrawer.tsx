import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/Button'
import { Badge } from '../../components/Badge'
import { Spinner } from '../../components/Spinner'
import { Globe, Code2, Boxes, X, FileCode2, Network, LayoutPanelTop } from 'lucide-react'
import {
  type Site,
  DANGER,
  errorText,
  kindLabel,
  kindAccent,
  formatTime,
} from './shared'

type Tab = 'overview' | 'domains' | 'config'

const TABS: { key: Tab; label: string; Icon: typeof Globe }[] = [
  { key: 'overview', label: '概览', Icon: LayoutPanelTop },
  { key: 'domains', label: '域名', Icon: Network },
  { key: 'config', label: '配置文件', Icon: FileCode2 },
]

const kindIcon: Record<string, typeof Globe> = { static: Globe, php: Code2, proxy: Boxes }

interface Props {
  site: Site
  canWrite: boolean
  isAdmin: boolean
  onClose: () => void
  onChanged: (site: Site) => void
}

/** SiteDrawer 站点详情右侧抽屉:tab 化(概览/域名/配置文件),写操作按角色门控。 */
export function SiteDrawer({ site, canWrite, isAdmin, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const Icon = kindIcon[site.kind] ?? Globe
  const accent = kindAccent[site.kind] ?? 'var(--color-brand)'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-bg shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-border px-6 py-5">
          <span
            className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-(--radius-card)"
            style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
          >
            <Icon size={20} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-[family-name:var(--font-display)] text-base font-semibold text-text">
                {site.name}
              </h2>
              <Badge status={site.enabled ? 'online' : 'neutral'}>
                {site.enabled ? '运行中' : '已停用'}
              </Badge>
              <Badge status="neutral">{kindLabel[site.kind] ?? site.kind}</Badge>
            </div>
            <p className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
              :{site.listen} · {site.domains.join(', ')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-surface-2 hover:text-text"
          >
            <X size={16} />
          </button>
        </header>

        <nav className="flex gap-1 border-b border-border px-4">
          {TABS.map(({ key, label, Icon: TabIcon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative -mb-px flex items-center gap-1.5 px-3 py-3 text-sm font-medium transition outline-none ${
                  active ? 'text-text' : 'text-muted hover:text-text'
                }`}
              >
                <TabIcon size={15} />
                {label}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex-1 overflow-auto p-6">
          {tab === 'overview' && <Overview site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'domains' && <Domains site={site} />}
          {tab === 'config' && (
            <ConfigTab site={site} isAdmin={isAdmin} onChanged={onChanged} />
          )}
        </div>
      </aside>
    </div>
  )
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`text-sm text-text ${mono ? 'font-[family-name:var(--font-mono)] break-all' : ''}`}>
        {children}
      </dd>
    </div>
  )
}

function Overview({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function toggle(enable: boolean) {
    if (!canWrite) return
    if (!enable && !window.confirm(`确认停用站点「${site.name}」?这将下线该站点。`)) return
    setBusy(true)
    setErr(null)
    try {
      const updated = await apiFetch<Site>(
        `/api/m/sites/sites/${site.id}/${enable ? 'enable' : 'disable'}`,
        { method: 'POST', headers: enable ? undefined : DANGER },
      )
      onChanged(updated)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-(--radius-card) border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text">运行状态</span>
            <span className="text-xs text-muted">
              {site.enabled ? '站点配置已下发,正在对外服务。' : '配置已从 nginx 移除,当前下线。'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {busy && <Spinner size={16} />}
            {site.enabled ? (
              <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => void toggle(false)}>
                停用
              </Button>
            ) : (
              <Button size="sm" disabled={!canWrite} onClick={() => void toggle(true)}>
                启用
              </Button>
            )}
          </div>
        </div>
        {err && <p className="mt-3 text-sm text-crit">{err}</p>}
      </section>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-(--radius-card) border border-border bg-surface p-5">
        <Field label="站点名">{site.name}</Field>
        <Field label="类型">{kindLabel[site.kind] ?? site.kind}</Field>
        <Field label="监听端口" mono>:{site.listen}</Field>
        <Field label="域名数">{site.domains.length}</Field>
        <Field label="创建时间">{formatTime(site.created_at)}</Field>
        <Field label="更新时间">{formatTime(site.updated_at)}</Field>
      </dl>
    </div>
  )
}

function Domains({ site }: { site: Site }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        当前绑定的域名(来自创建时的配置)。修改域名请在配置文件 tab 调整。
      </p>
      <ul className="flex flex-col gap-2">
        {site.domains.map((d) => (
          <li
            key={d}
            className="flex items-center gap-3 rounded-(--radius-card) border border-border bg-surface px-4 py-3"
          >
            <Globe size={15} className="shrink-0 text-muted" />
            <span className="truncate font-[family-name:var(--font-mono)] text-sm text-text">{d}</span>
            <span className="ml-auto shrink-0 font-[family-name:var(--font-mono)] text-xs text-muted">
              :{site.listen}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ConfigTab({
  site,
  isAdmin,
  onChanged,
}: {
  site: Site
  isAdmin: boolean
  onChanged: (s: Site) => void
}) {
  const [draft, setDraft] = useState(site.config)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const full = await apiFetch<Site>(`/api/m/sites/sites/${site.id}`)
      setDraft(full.config)
    } catch {
      setDraft(site.config)
    } finally {
      setLoading(false)
    }
  }, [site.id, site.config])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!isAdmin || !window.confirm('确认替换站点配置?原始配置可绕过建站白名单,属危险操作。')) return
    setBusy(true)
    setErr(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/config`, {
        method: 'PUT',
        headers: DANGER,
        body: JSON.stringify({ config: draft }),
      })
      onChanged(updated)
      setErr(null)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size={22} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          生成的 nginx 配置。{isAdmin ? '编辑后保存会经 nginx -t 校验,失败则不生效。' : '仅 admin 可编辑。'}
        </p>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        readOnly={!isAdmin}
        className="h-[52vh] w-full resize-none rounded-(--radius-card) border border-border bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60"
      />
      {err && (
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {err}
        </p>
      )}
      {isAdmin && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void save()} disabled={busy || draft === site.config}>
            {busy && <Spinner size={14} />}
            保存配置
          </Button>
          <span className="text-xs text-muted">危险操作,会立即重载 nginx。</span>
        </div>
      )}
    </div>
  )
}
