import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Globe, Code2, Boxes, Trash2, ChevronRight } from 'lucide-react'
import { type Site, kindLabel, kindAccent } from './shared'

const kindIcon: Record<string, typeof Globe> = { static: Globe, php: Code2, proxy: Boxes }

interface Props {
  site: Site
  canWrite: boolean
  isAdmin: boolean
  onOpen: () => void
  onToggle: (enable: boolean) => void
  onDelete: () => void
}

/** SiteCard 站点卡片:左侧类型色条 + 图标,域名/端口/状态,行内启停与删除。 */
export function SiteCard({ site, canWrite, isAdmin, onOpen, onToggle, onDelete }: Props) {
  const Icon = kindIcon[site.kind] ?? Globe
  const accent = kindAccent[site.kind] ?? 'var(--color-brand)'

  return (
    <div
      onClick={onOpen}
      className="group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-(--radius-card) border border-border bg-surface p-4 transition hover:border-muted/40 hover:shadow-[0_10px_30px_-16px_rgba(0,0,0,0.7)]"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 opacity-70 transition group-hover:opacity-100"
        style={{ background: accent }}
      />
      <span
        className="ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-(--radius-card)"
        style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
      >
        <Icon size={20} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-text">{site.name}</span>
          <Badge status={site.enabled ? 'online' : 'neutral'}>
            {site.enabled ? '运行中' : '已停用'}
          </Badge>
          <Badge status="neutral">{kindLabel[site.kind] ?? site.kind}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-[family-name:var(--font-mono)] text-xs text-muted">
          <span className="text-text/70">:{site.listen}</span>
          <span className="truncate">{site.domains.join('  ·  ')}</span>
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {site.enabled ? (
          <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => onToggle(false)}>
            停用
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => onToggle(true)}>
            启用
          </Button>
        )}
        <button
          onClick={onDelete}
          disabled={!isAdmin}
          aria-label="删除站点"
          title={isAdmin ? '删除站点' : '需要 admin 角色'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-crit/10 hover:text-crit disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <ChevronRight
        size={16}
        className="shrink-0 text-muted/50 transition group-hover:translate-x-0.5 group-hover:text-muted"
      />
    </div>
  )
}
