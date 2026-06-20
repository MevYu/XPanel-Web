import { Logo } from 'xpanel-web'
import { Frame } from '../_frame'

export function Default() {
  return (
    <Frame>
      <Logo />
    </Frame>
  )
}

export function Large() {
  return (
    <Frame>
      <Logo size={72} />
    </Frame>
  )
}

export function Sizes() {
  return (
    <Frame>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <Logo size={24} />
        <Logo size={40} />
        <Logo size={64} />
      </div>
    </Frame>
  )
}

export function Wordmark() {
  return (
    <Frame>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Logo size={28} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>
          XPanel
        </span>
      </div>
    </Frame>
  )
}
