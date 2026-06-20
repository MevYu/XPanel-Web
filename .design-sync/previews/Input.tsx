import { Input } from 'xpanel-web'
import { Frame } from '../_frame'

export function Default() {
  return (
    <Frame>
      <div style={{ width: 300 }}>
        <Input label="域名" placeholder="example.com" defaultValue="api.acme.io" />
      </div>
    </Frame>
  )
}

export function WithError() {
  return (
    <Frame>
      <div style={{ width: 300 }}>
        <Input label="端口" defaultValue="80" error="端口 80 已被占用" />
      </div>
    </Frame>
  )
}

export function Password() {
  return (
    <Frame>
      <div style={{ width: 300 }}>
        <Input label="数据库密码" type="password" defaultValue="s3cr3t-pass" />
      </div>
    </Frame>
  )
}

export function Disabled() {
  return (
    <Frame>
      <div style={{ width: 300 }}>
        <Input label="只读字段" defaultValue="不可编辑" disabled />
      </div>
    </Frame>
  )
}
