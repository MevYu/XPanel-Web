import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { DirEntry } from '../../api/types'
import { FileIcon } from '../../pages/files/FileIcon'
import { Spinner } from '../Spinner'

// joinPath 拼接目录与名字,根目录为空串。
function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

/**
 * FileTreeSidebar 编辑器左侧文件树:展示 rootDir 下的文件/文件夹,
 * 文件夹懒展开(按需 listDir 子目录),文件点击触发 onOpenFile。
 * activePath 为当前打开文件,高亮显示。
 */
export function FileTreeSidebar({
  rootDir,
  activePath,
  listDir,
  onOpenFile,
}: {
  rootDir: string
  activePath: string
  listDir: (path: string) => Promise<DirEntry[]>
  onOpenFile: (path: string) => void
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-border bg-[#0C1118]">
      <div className="shrink-0 truncate border-b border-border px-3 py-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-muted">
        {rootDir ? `/${rootDir}` : '根目录'}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <DirChildren
          dir={rootDir}
          depth={0}
          activePath={activePath}
          listDir={listDir}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  )
}

// DirChildren 加载并渲染某目录的直接子项;depth 控制缩进。
function DirChildren({
  dir,
  depth,
  activePath,
  listDir,
  onOpenFile,
}: {
  dir: string
  depth: number
  activePath: string
  listDir: (path: string) => Promise<DirEntry[]>
  onOpenFile: (path: string) => void
}) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setEntries(null)
    setError(null)
    listDir(dir)
      .then((data) => {
        if (!alive) return
        const sorted = [...data].sort((a, b) =>
          a.is_dir === b.is_dir ? a.name.localeCompare(b.name) : a.is_dir ? -1 : 1,
        )
        setEntries(sorted)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : '读取目录失败')
      })
    return () => {
      alive = false
    }
  }, [dir, listDir])

  if (error)
    return (
      <p
        className="px-3 py-1 text-xs text-crit"
        style={{ paddingLeft: depth * 14 + 12 }}
      >
        {error}
      </p>
    )
  if (entries === null)
    return (
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: depth * 14 + 12 }}>
        <Spinner size={14} />
      </div>
    )
  if (entries.length === 0)
    return (
      <p className="px-3 py-1 text-xs text-faint" style={{ paddingLeft: depth * 14 + 12 }}>
        空目录
      </p>
    )

  return (
    <>
      {entries.map((e) => (
        <TreeNode
          key={e.name}
          entry={e}
          dir={dir}
          depth={depth}
          activePath={activePath}
          listDir={listDir}
          onOpenFile={onOpenFile}
        />
      ))}
    </>
  )
}

function TreeNode({
  entry,
  dir,
  depth,
  activePath,
  listDir,
  onOpenFile,
}: {
  entry: DirEntry
  dir: string
  depth: number
  activePath: string
  listDir: (path: string) => Promise<DirEntry[]>
  onOpenFile: (path: string) => void
}) {
  const path = joinPath(dir, entry.name)
  const [open, setOpen] = useState(false)
  const active = !entry.is_dir && path === activePath

  const onClick = useCallback(() => {
    if (entry.is_dir) setOpen((v) => !v)
    else onOpenFile(path)
  }, [entry.is_dir, onOpenFile, path])

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        title={entry.name}
        className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[13px] transition ${
          active ? 'bg-brand-soft text-brand' : 'text-text hover:bg-surface-2'
        }`}
        style={{ paddingLeft: depth * 14 + 8 }}
      >
        <span className="flex w-4 shrink-0 items-center justify-center text-faint">
          {entry.is_dir ? (
            open ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : null}
        </span>
        <FileIcon name={entry.name} isDir={entry.is_dir} size={15} />
        <span className="truncate">{entry.name}</span>
      </button>
      {entry.is_dir && open && (
        <DirChildren
          dir={path}
          depth={depth + 1}
          activePath={activePath}
          listDir={listDir}
          onOpenFile={onOpenFile}
        />
      )}
    </>
  )
}
