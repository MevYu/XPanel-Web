import { Spinner } from 'xpanel-web'
import { Frame } from '../_frame'

export function Default() {
  return (
    <Frame>
      <Spinner />
    </Frame>
  )
}

export function Sizes() {
  return (
    <Frame>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <Spinner size={14} />
        <Spinner size={20} />
        <Spinner size={32} />
      </div>
    </Frame>
  )
}

export function InlineLabel() {
  return (
    <Frame>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--color-muted)' }}>
        <Spinner size={16} />
        <span style={{ fontSize: 13 }}>正在加载模块…</span>
      </div>
    </Frame>
  )
}
