import { useState } from 'react'
import { Badge } from '../../components/Badge'
import { TabModal, type ModalTab } from '../../components/TabModal'
import {
  Code2,
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
import { type Site, type Kind, kindLabel } from './shared'
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

interface TabDef extends ModalTab<TabKey> {
  Icon: LucideIcon
  kinds?: Kind[] // 限定可见的站点类型;空 = 全部
}

// 顺序参考 aaPanel:概览/域名/SSL/PHP/伪静态/反向代理/默认文档/目录保护/重定向/防盗链/运行目录/日志/备份/设置/配置文件。
const ALL_TABS: TabDef[] = [
  { key: 'overview', label: '概览', Icon: LayoutPanelTop },
  { key: 'domains', label: '域名', Icon: Network },
  { key: 'ssl', label: 'SSL', Icon: ShieldCheck },
  { key: 'php', label: 'PHP', Icon: Code2, kinds: ['php'] },
  { key: 'rewrite', label: '伪静态', Icon: Repeat, kinds: ['static', 'php'] },
  { key: 'proxy', label: '反向代理', Icon: ArrowLeftRight, kinds: ['proxy'] },
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

interface Props {
  site: Site
  canWrite: boolean
  isAdmin: boolean
  onClose: () => void
  onChanged: (site: Site) => void
  /** 打开时默认选中的 tab,缺省为 overview。 */
  initialTab?: TabKey
}

/** SiteDrawer 站点设置弹窗:居中左竖 tab 模态(TabModal),完整 aaPanel 级设置 tab,按站点类型动态显隐。 */
export function SiteDrawer({ site, canWrite, isAdmin, onClose, onChanged, initialTab }: Props) {
  const tabs = ALL_TABS.filter((t) => !t.kinds || t.kinds.includes(site.kind))
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'overview')

  return (
    <TabModal
      title="网站设置"
      subtitle={
        <>
          <span className="truncate text-[13px] text-muted">— {site.name}</span>
          <Badge status={site.enabled ? 'online' : 'neutral'}>
            {site.enabled ? '运行中' : '已停用'}
          </Badge>
          <Badge status="neutral">{kindLabel[site.kind] ?? site.kind}</Badge>
        </>
      }
      tabs={tabs}
      active={tab}
      onTab={setTab}
      onClose={onClose}
    >
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
    </TabModal>
  )
}
