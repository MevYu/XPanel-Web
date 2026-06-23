import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Tabs } from '../components/Tabs'
import { SqlEnginePanel } from './database/SqlEnginePanel'
import { RedisPanel } from './database/RedisPanel'
import { BackupsPanel } from './database/BackupsPanel'
import { SettingsModal } from './database/SettingsModal'

type Tab = 'mysql' | 'postgres' | 'redis' | 'backups'

// 引擎切换对齐 aaPanel 顶部 tab(MySQL / PgSQL / Redis …);连接设置是工具栏动作,不进 tab。
const TABS: { key: Tab; label: string }[] = [
  { key: 'mysql', label: 'MySQL' },
  { key: 'postgres', label: 'PgSQL' },
  { key: 'redis', label: 'Redis' },
  { key: 'backups', label: '备份记录' },
]

/** Database 数据库:MySQL/PostgreSQL 库与用户管理(紧凑 Table + 弹窗操作)、库级备份恢复、Redis info 与清库、连接设置。 */
export default function Database() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const [tab, setTab] = useState<Tab>('mysql')
  const [refreshKey, setRefreshKey] = useState(0)
  const [backupsKey, setBackupsKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (!isAdmin) {
    return (
      <Card>
        <p className="text-sm text-muted">数据库管理需要 admin 角色。</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'mysql' && (
        <SqlEnginePanel
          engine="mysql"
          refreshKey={refreshKey}
          onBackupDone={() => setBackupsKey((k) => k + 1)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      {tab === 'postgres' && (
        <SqlEnginePanel
          engine="postgres"
          refreshKey={refreshKey}
          onBackupDone={() => setBackupsKey((k) => k + 1)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      {tab === 'redis' && <RedisPanel />}
      {tab === 'backups' && <BackupsPanel refreshKey={backupsKey} />}

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  )
}
