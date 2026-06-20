import { Stat } from 'xpanel-web'
import { Frame } from '../_frame'

export function Default() {
  return (
    <Frame>
      <Stat value="42%" label="CPU 使用率" />
    </Frame>
  )
}

export function Dashboard() {
  return (
    <Frame>
      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
        <Stat value="42%" label="CPU" />
        <Stat value="6.1 GB" label="内存" />
        <Stat value="128 GB" label="磁盘" />
        <Stat value="14d 6h" label="运行时长" />
      </div>
    </Frame>
  )
}
