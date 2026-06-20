import { Badge } from 'xpanel-web'
import { Frame } from '../_frame'

export function Online() {
  return (
    <Frame>
      <Badge status="online">运行中</Badge>
    </Frame>
  )
}

export function Warning() {
  return (
    <Frame>
      <Badge status="warn">负载偏高</Badge>
    </Frame>
  )
}

export function Critical() {
  return (
    <Frame>
      <Badge status="crit">已停止</Badge>
    </Frame>
  )
}

export function Neutral() {
  return (
    <Frame>
      <Badge status="neutral">未部署</Badge>
    </Frame>
  )
}

export function AllStatuses() {
  return (
    <Frame>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Badge status="online">运行中</Badge>
        <Badge status="warn">负载偏高</Badge>
        <Badge status="crit">已停止</Badge>
        <Badge status="neutral">未部署</Badge>
      </div>
    </Frame>
  )
}
