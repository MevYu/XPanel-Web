import { useState } from 'react'
import { Switch } from 'xpanel-web'
import { Frame } from '../_frame'

function Row({ initial, label, disabled }: { initial: boolean; label: string; disabled?: boolean }) {
  const [on, setOn] = useState(initial)
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <Switch checked={on} onChange={setOn} disabled={disabled} aria-label={label} />
      <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{label}</span>
    </div>
  )
}

export function On() {
  return (
    <Frame>
      <Row initial label="已启用模块" />
    </Frame>
  )
}

export function Off() {
  return (
    <Frame>
      <Row initial={false} label="未启用模块" />
    </Frame>
  )
}

export function States() {
  return (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Row initial label="自动续期 SSL" />
        <Row initial={false} label="开启防火墙" />
        <Row initial disabled label="只读（不可改）" />
      </div>
    </Frame>
  )
}
