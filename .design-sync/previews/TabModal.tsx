import { useState } from 'react'
import { TabModal, Badge, Input } from 'xpanel-web'
import { Globe, Shield, Database, FileCog } from 'lucide-react'

const tabs = [
  { key: 'general', label: '常规', Icon: Globe },
  { key: 'ssl', label: 'SSL 证书', Icon: Shield },
  { key: 'db', label: '数据库', Icon: Database },
  { key: 'config', label: '配置文件', Icon: FileCog },
]

// Overlay component (fixed inset-0). The wrapper's `transform` becomes the
// containing block so the modal renders inside this sized scene rather than
// escaping the card (which collapses to blank). cardMode/viewport set in config.
export function SiteSettings() {
  const [active, setActive] = useState('general')
  return (
    <div
      style={{
        position: 'relative',
        width: 900,
        height: 600,
        transform: 'translateZ(0)',
        overflow: 'hidden',
        borderRadius: 8,
        background: 'var(--color-bg)',
      }}
    >
      <TabModal
        title="网站设置"
        subtitle={<Badge status="online">运行中</Badge>}
        tabs={tabs}
        active={active}
        onTab={setActive}
        onClose={() => {}}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 360 }}>
          <Input label="主域名" defaultValue="example.com" />
          <Input label="网站根目录" defaultValue="/www/wwwroot/example.com" />
          <Input label="PHP 版本" defaultValue="8.2" />
        </div>
      </TabModal>
    </div>
  )
}
