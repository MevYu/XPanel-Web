import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  ArrowUp,
  RefreshCw,
  FilePlus,
  FolderPlus,
  Search,
  X,
} from 'lucide-react'
import type { DirEntry } from '../../api/types'
import { FileIcon } from '../../pages/files/FileIcon'
import { Spinner } from '../Spinner'

// joinPath 拼接目录与名字,根目录为空串。
function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

// parentPath 取上一级目录;已在根(空串)时返回空串(由调用方靠 disabled 兜底)。
function parentPath(dir: string): string {
  const i = dir.lastIndexOf('/')
  return i < 0 ? '' : dir.slice(0, i)
}

/**
 * FileTreeSidebar 编辑器左侧文件树:顶部紧凑工具条(上一级/刷新/新建/过滤),
 * 下方展示当前根目录下的文件/文件夹。文件夹懒展开(按需 listDir 子目录),
 * 文件点击触发 onOpenFile。activePath 为当前打开文件,高亮显示。
 *
 * 侧栏根目录由内部 state 维护,初始为 rootDir;"上一级"上移根目录,与主列表 cwd 解耦。
 */
export function FileTreeSidebar({
  rootDir,
  activePath,
  canWrite,
  listDir,
  onOpenFile,
  mkdir,
  createFile,
}: {
  rootDir: string
  activePath: string
  canWrite: boolean
  listDir: (path: string) => Promise<DirEntry[]>
  onOpenFile: (path: string) => void
  // mkdir 在指定路径创建文件夹;createFile 创建空文件。失败抛错由工具条捕获展示。
  mkdir: (path: string) => Promise<void>
  createFile: (path: string) => Promise<void>
}) {
  const [root, setRoot] = useState(rootDir)
  // reloadKey 自增即强制 DirChildren 重新挂载并重新 listDir(刷新当前根)。
  const [reloadKey, setReloadKey] = useState(0)
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [creating, setCreating] = useState<'file' | 'dir' | null>(null)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-border bg-[#0C1118]">
      {/* 顶部工具条 */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-1.5 py-1">
        <ToolbarBtn
          title="上一级目录"
          disabled={root === ''}
          onClick={() => {
            setRoot((r) => parentPath(r))
            setReloadKey((k) => k + 1)
          }}
          icon={<ArrowUp size={15} />}
        />
        <ToolbarBtn title="刷新" onClick={refresh} icon={<RefreshCw size={15} />} />
        {canWrite && (
          <>
            <ToolbarBtn
              title="新建文件"
              onClick={() => {
                setCreateErr(null)
                setCreating('file')
              }}
              icon={<FilePlus size={15} />}
            />
            <ToolbarBtn
              title="新建文件夹"
              onClick={() => {
                setCreateErr(null)
                setCreating('dir')
              }}
              icon={<FolderPlus size={15} />}
            />
          </>
        )}
        <ToolbarBtn
          title="过滤当前目录"
          active={showFilter}
          onClick={() => {
            setShowFilter((v) => {
              if (v) setFilter('')
              return !v
            })
          }}
          icon={<Search size={15} />}
        />
        <span
          className="ml-1 min-w-0 flex-1 truncate text-right font-[family-name:var(--font-mono)] text-[11px] text-faint"
          title={root ? `/${root}` : '根目录'}
        >
          {root ? `/${root}` : '根目录'}
        </span>
      </div>

      {showFilter && (
        <div className="relative shrink-0 border-b border-border px-1.5 py-1">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="按名字过滤…"
            className="h-7 w-full rounded-(--radius-sm) border border-border bg-surface-2/70 px-2 pr-7 font-[family-name:var(--font-mono)] text-[12px] text-text outline-none focus:border-brand"
          />
          {filter && (
            <button
              type="button"
              aria-label="清空过滤"
              title="清空"
              onClick={() => setFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint transition hover:text-text"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {creating && (
        <NewEntryRow
          kind={creating}
          err={createErr}
          onCancel={() => {
            setCreating(null)
            setCreateErr(null)
          }}
          onSubmit={async (name) => {
            const path = joinPath(root, name)
            try {
              if (creating === 'dir') await mkdir(path)
              else await createFile(path)
              setCreating(null)
              setCreateErr(null)
              refresh()
            } catch (e) {
              setCreateErr(e instanceof Error ? e.message : '创建失败')
            }
          }}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <DirChildren
          key={`${root}#${reloadKey}`}
          dir={root}
          depth={0}
          filter={filter}
          activePath={activePath}
          listDir={listDir}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  )
}

function ToolbarBtn({
  title,
  onClick,
  icon,
  disabled,
  active,
}: {
  title: string
  onClick: () => void
  icon: React.ReactNode
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-sm) transition disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? 'bg-brand-soft text-brand'
          : 'text-muted hover:bg-surface-2 hover:text-text'
      }`}
    >
      {icon}
    </button>
  )
}

// NewEntryRow 顶部内联输入:新建文件/文件夹的名字,回车提交 / Esc 取消。
function NewEntryRow({
  kind,
  err,
  onCancel,
  onSubmit,
}: {
  kind: 'file' | 'dir'
  err: string | null
  onCancel: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const v = name.trim()
    if (!v || busy) return
    setBusy(true)
    await onSubmit(v)
    setBusy(false)
  }

  return (
    <div className="shrink-0 border-b border-border px-1.5 py-1">
      <div className="flex items-center gap-1.5">
        {kind === 'dir' ? (
          <FolderPlus size={14} className="shrink-0 text-faint" />
        ) : (
          <FilePlus size={14} className="shrink-0 text-faint" />
        )}
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
          onBlur={() => {
            if (!name.trim()) onCancel()
          }}
          placeholder={kind === 'dir' ? '文件夹名…' : '文件名…'}
          className="h-7 min-w-0 flex-1 rounded-(--radius-sm) border border-border bg-surface-2/70 px-2 font-[family-name:var(--font-mono)] text-[12px] text-text outline-none focus:border-brand"
        />
      </div>
      {err && <p className="mt-1 text-[11px] text-crit">{err}</p>}
    </div>
  )
}

// DirChildren 加载并渲染某目录的直接子项;depth 控制缩进。
// filter 仅对顶层(depth 0)的名字做客户端过滤(不传递给子目录)。
function DirChildren({
  dir,
  depth,
  filter,
  activePath,
  listDir,
  onOpenFile,
}: {
  dir: string
  depth: number
  filter?: string
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

  const shown = useMemo(() => {
    if (entries === null) return null
    const q = filter?.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.name.toLowerCase().includes(q))
  }, [entries, filter])

  if (error)
    return (
      <p
        className="px-3 py-1 text-xs text-crit"
        style={{ paddingLeft: depth * 14 + 12 }}
      >
        {error}
      </p>
    )
  if (shown === null)
    return (
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: depth * 14 + 12 }}>
        <Spinner size={14} />
      </div>
    )
  if (shown.length === 0)
    return (
      <p className="px-3 py-1 text-xs text-faint" style={{ paddingLeft: depth * 14 + 12 }}>
        {filter?.trim() ? '无匹配' : '空目录'}
      </p>
    )

  return (
    <>
      {shown.map((e) => (
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
