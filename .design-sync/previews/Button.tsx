import { Button } from 'xpanel-web'
import { Frame } from '../_frame'

export function Primary() {
  return (
    <Frame>
      <Button>保存配置</Button>
    </Frame>
  )
}

export function Ghost() {
  return (
    <Frame>
      <Button variant="ghost">取消</Button>
    </Frame>
  )
}

export function Danger() {
  return (
    <Frame>
      <Button variant="danger">删除站点</Button>
    </Frame>
  )
}

export function Sizes() {
  return (
    <Frame>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button size="sm">小尺寸</Button>
        <Button size="md">中尺寸</Button>
      </div>
    </Frame>
  )
}

export function Disabled() {
  return (
    <Frame>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button disabled>处理中…</Button>
        <Button variant="ghost" disabled>
          不可用
        </Button>
      </div>
    </Frame>
  )
}
