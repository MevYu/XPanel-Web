import { Table, Badge, ActionLink, ActionLinks } from 'xpanel-web'
import { Frame } from '../_frame'

type Site = {
  id: number
  domain: string
  status: 'online' | 'crit'
  port: number
  php: string
}

const rows: Site[] = [
  { id: 1, domain: 'example.com', status: 'online', port: 443, php: '8.2' },
  { id: 2, domain: 'api.acme.io', status: 'online', port: 443, php: '8.3' },
  { id: 3, domain: 'legacy.internal', status: 'crit', port: 80, php: '7.4' },
]

const columns = [
  { key: 'domain', header: '域名', cell: (r: Site) => r.domain },
  {
    key: 'status',
    header: '状态',
    cell: (r: Site) => (
      <Badge status={r.status}>{r.status === 'online' ? '运行中' : '已停止'}</Badge>
    ),
  },
  { key: 'php', header: 'PHP', cell: (r: Site) => r.php },
  { key: 'port', header: '端口', align: 'right' as const, cell: (r: Site) => r.port },
  {
    key: 'actions',
    header: '操作',
    align: 'right' as const,
    cell: () => (
      <ActionLinks>
        <ActionLink onClick={() => {}}>管理</ActionLink>
        <ActionLink danger onClick={() => {}}>
          删除
        </ActionLink>
      </ActionLinks>
    ),
  },
]

export function SiteList() {
  return (
    <Frame>
      <Table columns={columns} rows={rows} rowKey={(r: Site) => r.id} />
    </Frame>
  )
}

export function Empty() {
  return (
    <Frame>
      <Table columns={columns} rows={[]} rowKey={(r: Site) => r.id} emptyText="尚未添加站点" />
    </Frame>
  )
}
