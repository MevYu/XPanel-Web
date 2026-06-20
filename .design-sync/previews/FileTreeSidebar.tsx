import { FileTreeSidebar } from 'xpanel-web'
import { Frame } from '../_frame'

type Entry = {
  name: string
  is_dir: boolean
  size: number
  mode: string
  mod_time: number
  owner: string
  group: string
}

const mk = (name: string, is_dir: boolean): Entry => ({
  name,
  is_dir,
  size: is_dir ? 0 : 2048,
  mode: is_dir ? 'drwxr-xr-x' : '-rw-r--r--',
  mod_time: 1700000000,
  owner: 'www',
  group: 'www',
})

const root: Entry[] = [
  mk('www', true),
  mk('logs', true),
  mk('ssl', true),
  mk('index.php', false),
  mk('.env', false),
  mk('composer.json', false),
  mk('README.md', false),
]

// Async tree: listDir resolves immediately so the capture settles on the populated tree.
const listDir = (path: string) => Promise.resolve(path === '' ? root : [])

export function ProjectTree() {
  return (
    <Frame style={{ padding: 0 }}>
      <div style={{ height: 440, width: 300 }}>
        <FileTreeSidebar
          rootDir=""
          activePath="index.php"
          canWrite
          listDir={listDir}
          onOpenFile={() => {}}
          mkdir={async () => {}}
          createFile={async () => {}}
        />
      </div>
    </Frame>
  )
}
