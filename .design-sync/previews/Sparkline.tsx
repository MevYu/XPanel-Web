import { Sparkline, Stat } from 'xpanel-web'
import { Frame } from '../_frame'

const cpu = [12, 18, 14, 22, 30, 26, 38, 33, 41, 36, 48, 44]
const net = [40, 38, 42, 35, 30, 33, 28, 31, 24, 27, 20, 18]

export function Default() {
  return (
    <Frame>
      <Sparkline data={cpu} />
    </Frame>
  )
}

export function Wide() {
  return (
    <Frame>
      <Sparkline data={cpu} width={240} height={48} />
    </Frame>
  )
}

export function WithReading() {
  return (
    <Frame>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Stat value="44%" label="CPU" />
          <Sparkline data={cpu} width={140} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Stat value="18 MB/s" label="网络" />
          <Sparkline data={net} width={140} />
        </div>
      </div>
    </Frame>
  )
}
