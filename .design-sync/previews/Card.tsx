import { Card, Stat, Badge } from 'xpanel-web'
import { Frame } from '../_frame'

export function Basic() {
  return (
    <Frame>
      <div style={{ width: 320 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Stat value="42%" label="CPU 使用率" />
            <Badge status="online">正常</Badge>
          </div>
        </Card>
      </div>
    </Frame>
  )
}

export function Hoverable() {
  return (
    <Frame>
      <div style={{ width: 320 }}>
        <Card hoverable>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>example.com</h3>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-muted)' }}>
            Nginx · PHP 8.2 · 443 端口
          </p>
        </Card>
      </div>
    </Frame>
  )
}
