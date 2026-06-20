import { IconButton } from 'xpanel-web'
import { RefreshCw, Settings, Trash2, Download } from 'lucide-react'
import { Frame } from '../_frame'

export function Default() {
  return (
    <Frame>
      <IconButton icon={<Settings size={16} />} aria-label="设置" />
    </Frame>
  )
}

export function Toolbar() {
  return (
    <Frame>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <IconButton icon={<RefreshCw size={16} />} aria-label="刷新" />
        <IconButton icon={<Download size={16} />} aria-label="下载" />
        <IconButton icon={<Settings size={16} />} aria-label="设置" />
        <IconButton icon={<Trash2 size={16} />} aria-label="删除" />
      </div>
    </Frame>
  )
}

export function Disabled() {
  return (
    <Frame>
      <IconButton icon={<Trash2 size={16} />} aria-label="删除" disabled />
    </Frame>
  )
}
