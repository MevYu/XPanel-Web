import { useEffect, useState } from 'react'
import { Badge } from '../../components/Badge'
import {
  Globe,
  Code2,
  Boxes,
  X,
  LayoutPanelTop,
  Network,
  ShieldCheck,
  Repeat,
  Forward,
  FileText,
  Lock,
  ArrowLeftRight,
  ShieldAlert,
  FolderTree,
  ScrollText,
  FileCode2,
  Archive,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { type Site, type Kind, kindLabel, kindAccent } from './shared'
import { OverviewTab } from './tabs/OverviewTab'
import { DomainsTab } from './tabs/DomainsTab'
import { SslTab } from './tabs/SslTab'
import { RewriteTab } from './tabs/RewriteTab'
import { ProxyTab } from './tabs/ProxyTab'
import { PhpTab } from './tabs/PhpTab'
import { DefaultDocsTab } from './tabs/DefaultDocsTab'
import { DirProtectTab } from './tabs/DirProtectTab'
import { RedirectsTab } from './tabs/RedirectsTab'
import { AntiLeechTab } from './tabs/AntiLeechTab'
import { RunDirTab } from './tabs/RunDirTab'
import { LogsTab } from './tabs/LogsTab'
import { ConfigTab } from './tabs/ConfigTab'
import { BackupsTab } from './tabs/BackupsTab'
import { SettingsTab } from './tabs/SettingsTab'

type TabKey =
  | 'overview'
  | 'domains'
  | 'ssl'
  | 'php'
  | 'rewrite'
  | 'proxy'
  | 'docs'
  | 'dir-protect'
  | 'redirects'
  | 'anti-leech'
  | 'run-dir'
  | 'logs'
  | 'backups'
  | 'settings'
  | 'config'

interface TabDef {
  key: TabKey
  label: string
  Icon: LucideIcon
  kinds?: Kind[] // 限定可见的站点类型;空 = 全部
}

const ALL_TABS: TabDef[] = [
  { key: 'overview', label: '概览', Icon: LayoutPanelTop },
  { key: 'domains', label: '域名', Icon: Network },
  { key: 'ssl', label: 'SSL', Icon: ShieldCheck },
  { key: 'php', label: 'PHP', Icon: Code2, kinds: ['php'] },
  { key: 'proxy', label: '反向代理', Icon: ArrowLeftRight, kinds: ['proxy'] },
  { key: 'rewrite', label: '伪静态', Icon: Repeat, kinds: ['static', 'php'] },
  { key: 'docs', label: '默认文档', Icon: FileText, kinds: ['static', 'php'] },
  { key: 'dir-protect', label: '目录保护', Icon: Lock },
  { key: 'redirects', label: '重定向', Icon: Forward },
  { key: 'anti-leech', label: '防盗链', Icon: ShieldAlert },
  { key: 'run-dir', label: '运行目录', Icon: FolderTree, kinds: ['static', 'php'] },
  { key: 'logs', label: '日志', Icon: ScrollText },
  { key: 'backups', label: '备份', Icon: Archive },
  { key: 'settings', label: '设置', Icon: SlidersHorizontal },
  { key: 'config', label: '配置文件', Icon: FileCode2 },
]

const kindIcon: Record<string, LucideIcon> = { static: Globe, php: Code2, proxy: Boxes }

interface Props {
  site: Site
  canWrite: boolean
  isAdmin: boolean
  onClose: () => void
  onChanged: (site: Site) => void
}

/** SiteDrawer 站点详情右侧抽屉:完整 aaPanel 级 tab 化设置,按站点类型动态显隐 tab。 */
export function SiteDrawer({ site, canWrite, isAdmin, onClose, onChanged }: Props) {
  const tabs = ALL_TABS.filter((t) => !t.kinds || t.kinds.includes(site.kind))
  const [tab, setTab] = useState<TabKey>('overview')

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

        <nav className="flex gap-0.5 overflow-x-auto border-b border-border px-4">
          {tabs.map(({ key, label, Icon: TabIcon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative -mb-px flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium transition outline-none ${
                  active ? 'text-text' : 'text-muted hover:text-text'
                }`}
              >
                <TabIcon size={15} />
                {label}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />}
              </button>
            )
          })}
        </nav>

        <div className="flex-1 overflow-auto p-6">
          {tab === 'overview' && <OverviewTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'domains' && <DomainsTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'ssl' && <SslTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'php' && <PhpTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'proxy' && <ProxyTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'rewrite' && <RewriteTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'docs' && <DefaultDocsTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'dir-protect' && <DirProtectTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'redirects' && <RedirectsTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'anti-leech' && <AntiLeechTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'run-dir' && <RunDirTab site={site} canWrite={canWrite} onChanged={onChanged} />}
          {tab === 'logs' && <LogsTab site={site} canWrite={canWrite} />}
          {tab === 'backups' && <BackupsTab site={site} isAdmin={isAdmin} />}
          {tab === 'settings' && (
            <SettingsTab site={site} canWrite={canWrite} isAdmin={isAdmin} onChanged={onChanged} />
          )}
          {tab === 'config' && <ConfigTab site={site} isAdmin={isAdmin} onChanged={onChanged} />}
        </div>
      </aside>
    </div>
  )
}
