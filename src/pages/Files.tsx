import { useCallback, useEffect, useRef, useState, lazy, Suspense} from 'react'
import {
  RefreshCw,
  FolderPlus,
  FilePlus,
  Upload,
  Share2,
  House,
  ChevronRight,
  ChevronDown,
  Download,
  Cloud,
  Copy,
  Scissors,
  ClipboardPaste,
  FileCog,
  UserCog,
  Archive,
  ArchiveRestore,
  Trash2,
  Search,
  Trash,
  Info,
  Pencil,
  FolderInput,
  X,
  Plus,
  Minus,
  Save,
  WrapText,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { IconButton } from '../components/IconButton'
import { Spinner } from '../components/Spinner'
import { formatBytes } from '../lib/format'
import { formatTime } from '../lib/formatTime'
import { uid } from '../lib/uid'
import type { DirEntry, DirSize, Share, TrashItem } from '../api/types'
import { FileIcon, isArchive } from './files/FileIcon'
import {
  CodeEditor,
  type CodeEditorViewHandle,
  type CursorStats,
} from '../components/CodeEditor'
import { languageFromFilename, languageLabel } from '../components/codeEditorLang'
import { FileTreeSidebar } from '../components/editor/FileTreeSidebar'

// 懒加载查找/替换栏:它引用 @codemirror/search 运行时,懒加载避免把 codemirror 拉进首屏主包。
const SearchBar = lazy(() =>
  import('../components/editor/SearchBar').then((m) => ({ default: m.SearchBar })),
)

const DANGER = { 'X-Confirm-Danger': '1' }

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function fmtTime(unix: number): string {
  return formatTime(unix)
}

// joinPath 拼接当前目录与名字,规范化 slash(根目录为空串)。
function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

function parentPath(dir: string): string {
  const i = dir.lastIndexOf('/')
  return i < 0 ? '' : dir.slice(0, i)
}

function baseName(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

// 把 mode 字符串(Go 的 "-rw-r--r--" 或 "drwxr-xr-x")转成八进制,失败回退原串。
function modeOctal(mode: string): string {
  const perm = mode.slice(-9)
  if (perm.length !== 9 || !/^[-rwxsStT]+$/.test(perm)) return mode
  let oct = ''
  for (let g = 0; g < 3; g++) {
    const s = perm.slice(g * 3, g * 3 + 3)
    let v = 0
    if (s[0] === 'r') v += 4
    if (s[1] === 'w') v += 2
    if (s[2] === 'x' || s[2] === 's' || s[2] === 't') v += 1
    oct += String(v)
  }
  return oct
}

// 带 Bearer 的原始 fetch,用于二进制下载与 multipart 上传(不能走强制 JSON 头的 apiFetch)。
function authHeaders(): Record<string, string> {
  const t = tokenStore.get()
  return t ? { Authorization: `Bearer ${t.access}` } : {}
}

type Clipboard = { mode: 'copy' | 'cut'; dir: string; names: string[] } | null

type Dialog =
  | { kind: 'newdir' }
  | { kind: 'newfile' }
  | { kind: 'rename'; entry: DirEntry }
  | { kind: 'chmod'; entries: DirEntry[] }
  | { kind: 'chown'; entries: DirEntry[] }
  | { kind: 'remote' }
  | { kind: 'compress'; names: string[] }
  | { kind: 'extract'; entry: DirEntry }
  | { kind: 'search' }
  | { kind: 'props'; entry: DirEntry }
  | null

interface Menu {
  x: number
  y: number
  entry: DirEntry
}

// 一个目录标签:id 用于 React key 与切换,path 是该标签当前所在目录(根目录为空串)。
interface DirTab {
  id: string
  path: string
}

const TABS_KEY = 'xpanel.files.tabs'

function tabLabel(path: string): string {
  return path ? baseName(path) : '根目录'
}

// 从 localStorage 恢复标签;数据非法/旧结构/为空时回退到单个根目录标签,cwd 永不为 undefined。
export function loadTabs(): { tabs: DirTab[]; activeId: string } {
  const fallback = () => {
    const id = uid()
    return { tabs: [{ id, path: '' }], activeId: id }
  }
  try {
    const raw = localStorage.getItem(TABS_KEY)
    if (!raw) return fallback()
    const parsed = JSON.parse(raw) as { tabs?: unknown; activeId?: unknown }
    // parsed 可能是旧结构(顶层数组)、非对象或缺字段;tabs 非数组直接回退,不依赖 filter 抛错。
    const rawTabs = Array.isArray(parsed?.tabs) ? parsed.tabs : []
    const tabs = rawTabs.filter(
      (t): t is DirTab => typeof t?.id === 'string' && typeof t?.path === 'string',
    )
    if (tabs.length === 0) return fallback()
    const activeId = tabs.some((t) => t.id === parsed?.activeId) ? (parsed.activeId as string) : tabs[0].id
    return { tabs, activeId }
  } catch {
    return fallback()
  }
}

export default function Files() {
  const { role } = useAuth()
  const canWrite = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'

  const [{ tabs, activeId }, setTabState] = useState(loadTabs)
  const cwd = tabs.find((t) => t.id === activeId)?.path ?? ''

  // setCwd 更新活动标签的 path,签名兼容旧的 setState(支持函数式更新)。
  const setCwd = useCallback(
    (next: string | ((prev: string) => string)) => {
      setTabState((s) => {
        const cur = s.tabs.find((t) => t.id === s.activeId)?.path ?? ''
        const path = typeof next === 'function' ? next(cur) : next
        return {
          ...s,
          tabs: s.tabs.map((t) => (t.id === s.activeId ? { ...t, path } : t)),
        }
      })
    },
    [],
  )

  function selectTab(id: string) {
    setTabState((s) => ({ ...s, activeId: id }))
  }

  function addTab() {
    setTabState((s) => {
      const id = uid()
      const cur = s.tabs.find((t) => t.id === s.activeId)?.path ?? ''
      return { tabs: [...s.tabs, { id, path: cur }], activeId: id }
    })
  }

  function openInNewTab(path: string) {
    setTabState((s) => {
      const id = uid()
      return { tabs: [...s.tabs, { id, path }], activeId: id }
    })
  }

  function closeTab(id: string) {
    setTabState((s) => {
      if (s.tabs.length <= 1) return s
      const idx = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      // 关掉活动标签时切到相邻标签(优先右侧,边界回退左侧)。
      const activeId =
        s.activeId === id ? (tabs[idx] ?? tabs[idx - 1] ?? tabs[0]).id : s.activeId
      return { tabs, activeId }
    })
  }

  useEffect(() => {
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs, activeId }))
  }, [tabs, activeId])

  const [pathInput, setPathInput] = useState('')
  const [editingPath, setEditingPath] = useState(false)
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showHidden, setShowHidden] = useState(true)
  const [clipboard, setClipboard] = useState<Clipboard>(null)
  const [dirSizes, setDirSizes] = useState<Record<string, DirSize>>({})
  const fileInput = useRef<HTMLInputElement | null>(null)

  const [dialog, setDialog] = useState<Dialog>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [newMenu, setNewMenu] = useState(false)

  const [editing, setEditing] = useState<{ path: string; text: string } | null>(null)
  const [sharing, setSharing] = useState<{ path: string; isDir: boolean } | null>(null)
  const [showShares, setShowShares] = useState(false)
  const [showTrash, setShowTrash] = useState(false)

  const load = useCallback(async (path: string) => {
    setLoading(true)
    setErr(null)
    try {
      const data = await apiFetch<DirEntry[]>(
        `/api/m/files/list?path=${encodeURIComponent(path)}`,
      )
      data.sort((a, b) =>
        a.is_dir === b.is_dir ? a.name.localeCompare(b.name) : a.is_dir ? -1 : 1,
      )
      setEntries(data)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSelected(new Set())
    setDirSizes({})
    setPathInput(cwd)
    setEditingPath(false)
    void load(cwd)
  }, [cwd, load])

  function flash(text: string) {
    setNotice(text)
    setErr(null)
  }

  async function refresh() {
    setSelected(new Set())
    setDirSizes({})
    await load(cwd)
  }

  function toggleSel(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const visible = entries.filter((e) => showHidden || !e.name.startsWith('.'))
  const selectedEntries = entries.filter((e) => selected.has(e.name))

  async function download(entry: DirEntry) {
    try {
      const res = await fetch(
        `/api/m/files/download?path=${encodeURIComponent(joinPath(cwd, entry.name))}`,
        { headers: authHeaders() },
      )
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = entry.name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(errorText(e))
    }
  }

  // readFileText 读取文件文本;对超大(413)/二进制(415)抛出友好错误。
  const readFileText = useCallback(async (path: string): Promise<string> => {
    const res = await fetch(`/api/m/files/read?path=${encodeURIComponent(path)}`, {
      headers: authHeaders(),
    })
    if (!res.ok) {
      const detail = (await res.text()).trim()
      if (res.status === 413) throw new Error('文件过大,无法在线编辑(上限 5 MiB)。')
      if (res.status === 415) throw new Error('二进制文件,无法在线编辑。')
      throw new Error(detail || '读取文件失败')
    }
    return res.text()
  }, [])

  // listDir 供编辑器文件树按需拉取子目录(不影响主列表 state)。
  const listDir = useCallback(async (path: string): Promise<DirEntry[]> => {
    return apiFetch<DirEntry[]>(`/api/m/files/list?path=${encodeURIComponent(path)}`)
  }, [])

  async function openEditor(entry: DirEntry) {
    const path = joinPath(cwd, entry.name)
    try {
      const text = await readFileText(path)
      setEditing({ path, text })
    } catch (e) {
      setErr(errorText(e))
    }
  }

  // writeFile 写文件并刷新主列表;失败抛错由编辑器内部捕获展示。
  const writeFile = useCallback(
    async (path: string, text: string): Promise<void> => {
      await apiFetch(`/api/m/files/write?path=${encodeURIComponent(path)}`, {
        method: 'POST',
        body: text,
      })
      flash(`已保存 ${path}`)
      await refresh()
    },
    // refresh/flash 为组件作用域内稳定闭包,刻意省略依赖避免无谓重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // sidebarMkdir / sidebarCreateFile 供编辑器文件树工具条新建用,不触碰主列表(侧栏自行刷新)。
  const sidebarMkdir = useCallback(async (path: string): Promise<void> => {
    await apiFetch(`/api/m/files/mkdir?path=${encodeURIComponent(path)}`, {
      method: 'POST',
    })
  }, [])

  const sidebarCreateFile = useCallback(async (path: string): Promise<void> => {
    await apiFetch(`/api/m/files/write?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      body: '',
    })
  }, [])

  async function upload(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`/api/m/files/upload?path=${encodeURIComponent(cwd)}`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      })
      if (!res.ok) throw new Error(await res.text())
      flash(`已上传 ${file.name}`)
      await refresh()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function remove(entry: DirEntry) {
    if (
      !window.confirm(
        `确认删除「${entry.name}」?将移入回收站,可在回收站还原。`,
      )
    )
      return
    try {
      await apiFetch(
        `/api/m/files/delete?path=${encodeURIComponent(joinPath(cwd, entry.name))}`,
        { method: 'POST', headers: DANGER },
      )
      flash('已移入回收站')
      await refresh()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function removeSelected() {
    const names = [...selected]
    if (names.length === 0) return
    if (!window.confirm(`确认删除选中的 ${names.length} 项?将移入回收站。`)) return
    try {
      for (const name of names) {
        await apiFetch(
          `/api/m/files/delete?path=${encodeURIComponent(joinPath(cwd, name))}`,
          { method: 'POST', headers: DANGER },
        )
      }
      flash(`已移入回收站 ${names.length} 项`)
      await refresh()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  function startCopy() {
    if (selected.size === 0) return
    setClipboard({ mode: 'copy', dir: cwd, names: [...selected] })
    flash(`已复制 ${selected.size} 项,进入目标目录后点击粘贴`)
  }

  function startCut() {
    if (selected.size === 0) return
    setClipboard({ mode: 'cut', dir: cwd, names: [...selected] })
    flash(`已剪切 ${selected.size} 项,进入目标目录后点击粘贴`)
  }

  async function paste() {
    if (!clipboard) return
    const { mode, dir, names } = clipboard
    try {
      for (const name of names) {
        const from = joinPath(dir, name)
        const to = joinPath(cwd, name)
        if (mode === 'copy') {
          await apiFetch('/api/m/files/copy', {
            method: 'POST',
            body: JSON.stringify({ from, to }),
          })
        } else {
          await apiFetch('/api/m/files/move', {
            method: 'POST',
            body: JSON.stringify({ src: from, dest: to }),
          })
        }
      }
      flash(mode === 'copy' ? `已复制 ${names.length} 项` : `已移动 ${names.length} 项`)
      if (mode === 'cut') setClipboard(null)
      await refresh()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function calcDirSize(name: string) {
    try {
      const r = await apiFetch<DirSize>(
        `/api/m/files/dirsize?path=${encodeURIComponent(joinPath(cwd, name))}`,
      )
      setDirSizes((prev) => ({ ...prev, [name]: r }))
    } catch (e) {
      setErr(errorText(e))
    }
  }

  const crumbs = cwd ? cwd.split('/') : []

  function ctxMenu(e: React.MouseEvent, entry: DirEntry) {
    e.preventDefault()
    if (!selected.has(entry.name)) setSelected(new Set([entry.name]))
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  return (
    <div className="flex h-full flex-col gap-3 min-h-0" onClick={() => setNewMenu(false)}>
      {/* 目录标签栏 */}
      <DirTabs
        tabs={tabs}
        activeId={activeId}
        onSelect={selectTab}
        onAdd={addTab}
        onClose={closeTab}
      />
      {/* 面包屑路径栏 */}
      <Card className="flex flex-wrap items-center gap-2 py-2.5">
        <IconButton
          aria-label="返回上级"
          title="返回上级"
          icon={<ChevronRight size={16} className="rotate-180" />}
          disabled={!cwd}
          onClick={() => setCwd(parentPath(cwd))}
        />
        {editingPath ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setCwd(pathInput.replace(/^\/+|\/+$/g, ''))
            }}
          >
            <input
              autoFocus
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onBlur={() => setEditingPath(false)}
              placeholder="输入路径后回车跳转,如 www/wwwroot"
              className="h-9 min-w-0 flex-1 rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 font-[family-name:var(--font-mono)] text-sm text-text outline-none focus:border-brand"
            />
          </form>
        ) : (
          <nav
            className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-sm"
            onDoubleClick={() => {
              setPathInput(cwd)
              setEditingPath(true)
            }}
            title="双击编辑路径"
          >
            <button
              className="flex items-center gap-1 rounded px-1.5 py-1 text-brand hover:bg-surface-2"
              onClick={() => setCwd('')}
            >
              <House size={15} />
              根目录
            </button>
            {crumbs.map((seg, i) => {
              const target = crumbs.slice(0, i + 1).join('/')
              const last = i === crumbs.length - 1
              return (
                <span key={target} className="flex items-center gap-0.5">
                  <ChevronRight size={14} className="text-muted" />
                  <button
                    className={`rounded px-1.5 py-1 hover:bg-surface-2 ${last ? 'text-text' : 'text-brand'}`}
                    onClick={() => setCwd(target)}
                  >
                    {seg}
                  </button>
                </span>
              )
            })}
          </nav>
        )}
        <IconButton
          aria-label="编辑路径"
          title="编辑路径"
          icon={<FolderInput size={16} />}
          onClick={() => {
            setPathInput(cwd)
            setEditingPath((v) => !v)
          }}
        />
        <IconButton
          aria-label="刷新"
          title="刷新"
          icon={<RefreshCw size={16} />}
          onClick={() => void refresh()}
        />
      </Card>

      {/* 工具栏 */}
      <Card className="flex flex-wrap items-center justify-between gap-2 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {canWrite && (
            <div className="relative">
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setNewMenu((v) => !v)
                }}
              >
                <FilePlus size={15} />
                新建
                <ChevronDown size={14} />
              </Button>
              {newMenu && (
                <div
                  className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-(--radius-sm) border border-border bg-surface shadow-[var(--shadow-elevated)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MenuItem
                    icon={<FolderPlus size={15} />}
                    label="新建文件夹"
                    onClick={() => {
                      setNewMenu(false)
                      setDialog({ kind: 'newdir' })
                    }}
                  />
                  <MenuItem
                    icon={<FilePlus size={15} />}
                    label="新建文件"
                    onClick={() => {
                      setNewMenu(false)
                      setDialog({ kind: 'newfile' })
                    }}
                  />
                </div>
              )}
            </div>
          )}
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
              <Upload size={15} />
              上传
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'remote' })}>
              <Cloud size={15} />
              远程下载
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
          {canWrite && (
            <>
              <Button size="sm" variant="ghost" onClick={startCopy} disabled={selected.size === 0}>
                <Copy size={15} />
                复制
              </Button>
              <Button size="sm" variant="ghost" onClick={startCut} disabled={selected.size === 0}>
                <Scissors size={15} />
                剪切
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void paste()} disabled={!clipboard}>
                <ClipboardPaste size={15} />
                粘贴{clipboard ? ` (${clipboard.names.length})` : ''}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void removeSelected()}
                disabled={selected.size === 0}
                className="hover:text-crit"
              >
                <Trash2 size={15} />
                删除
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDialog({ kind: 'chmod', entries: selectedEntries })}
                disabled={selected.size === 0}
              >
                <FileCog size={15} />
                权限
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDialog({ kind: 'chown', entries: selectedEntries })}
                  disabled={selected.size === 0}
                >
                  <UserCog size={15} />
                  属主
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDialog({ kind: 'compress', names: [...selected] })}
                disabled={selected.size === 0}
              >
                <Archive size={15} />
                压缩
              </Button>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'search' })}>
            <Search size={15} />
            搜索
          </Button>
          <label className="flex cursor-pointer items-center gap-1.5 px-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            隐藏文件
          </label>
          <Button size="sm" variant="ghost" onClick={() => setShowShares(true)}>
            <Share2 size={15} />
            分享列表
          </Button>
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={() => setShowTrash(true)}>
              <Trash size={15} />
              回收站
            </Button>
          )}
        </div>
      </Card>

      {notice && <p className="text-sm text-online">{notice}</p>}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : err ? (
          <p className="p-5 text-sm text-crit">{err}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-surface">
                <tr className="border-b border-border text-xs text-muted">
                {canWrite && (
                  <th className="w-10 px-4 py-2.5 text-left font-medium">
                    <input
                      type="checkbox"
                      checked={visible.length > 0 && selected.size === visible.length}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? new Set(visible.map((x) => x.name)) : new Set(),
                        )
                      }
                    />
                  </th>
                )}
                <th className="px-4 py-2.5 text-left font-medium">名称</th>
                <th className="hidden w-52 px-4 py-2.5 text-left font-medium md:table-cell">
                  权限 · 属主
                </th>
                <th className="hidden w-28 px-4 py-2.5 text-right font-medium sm:table-cell">
                  大小
                </th>
                <th className="hidden w-44 px-4 py-2.5 text-left font-medium lg:table-cell">
                  修改时间
                </th>
                <th className="px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {cwd && (
                <tr
                  className="cursor-pointer border-b border-border/60 hover:bg-surface-2"
                  onDoubleClick={() => setCwd(parentPath(cwd))}
                  title="双击返回上级"
                >
                  {canWrite && <td className="sticky top-[37px] z-10 bg-surface px-4 py-2.5" />}
                  <td
                    className="sticky top-[37px] z-10 bg-surface px-4 py-2.5"
                    colSpan={5}
                  >
                    <span className="font-[family-name:var(--font-mono)] text-muted">
                      .. 上级目录
                    </span>
                  </td>
                </tr>
              )}
              {visible.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted" colSpan={canWrite ? 6 : 5}>
                    空目录。
                  </td>
                </tr>
              ) : (
                visible.map((entry) => (
                  <tr
                    key={entry.name}
                    className="group cursor-pointer border-b border-border/60 hover:bg-surface-2"
                    onContextMenu={(e) => ctxMenu(e, entry)}
                    onClick={() => setSelected(new Set([entry.name]))}
                    onDoubleClick={() => {
                      // 单击选中该行,双击才进入/打开:目录进入,文件进编辑器。
                      if (entry.is_dir) setCwd(joinPath(cwd, entry.name))
                      else if (canWrite) void openEditor(entry)
                    }}
                  >
                    {canWrite && (
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(entry.name)}
                          onChange={() => toggleSel(entry.name)}
                        />
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <div
                        className="flex min-w-0 items-center gap-2.5 text-left"
                        title={entry.is_dir ? '双击进入目录' : '双击编辑'}
                      >
                        <FileIcon name={entry.name} isDir={entry.is_dir} />
                        <span
                          className={`truncate text-text ${entry.is_dir ? 'group-hover:underline' : 'group-hover:text-brand'}`}
                        >
                          {entry.name}
                        </span>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-2.5 font-[family-name:var(--font-mono)] text-xs text-muted md:table-cell">
                      {modeOctal(entry.mode)}
                      {'  '}
                      <span className="text-faint">
                        {entry.owner}:{entry.group}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-right font-[family-name:var(--font-mono)] text-xs text-muted sm:table-cell">
                      {entry.is_dir ? (
                        dirSizes[entry.name] ? (
                          formatBytes(dirSizes[entry.name].bytes)
                        ) : (
                          <button
                            className="text-brand hover:underline"
                            onClick={() => void calcDirSize(entry.name)}
                          >
                            计算
                          </button>
                        )
                      ) : (
                        formatBytes(entry.size)
                      )}
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted lg:table-cell">
                      {fmtTime(entry.mod_time)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2 opacity-0 transition group-hover:opacity-100 [&>*+*]:before:mr-2 [&>*+*]:before:text-border [&>*+*]:before:content-['|']">
                        {!entry.is_dir && (
                          <RowLink onClick={() => void download(entry)}>下载</RowLink>
                        )}
                        {!entry.is_dir && canWrite && (
                          <RowLink onClick={() => void openEditor(entry)}>编辑</RowLink>
                        )}
                        {canWrite && (
                          <>
                            <RowLink onClick={() => setDialog({ kind: 'chmod', entries: [entry] })}>
                              权限
                            </RowLink>
                            <RowLink onClick={() => setDialog({ kind: 'rename', entry })}>
                              重命名
                            </RowLink>
                            <RowLink danger onClick={() => void remove(entry)}>
                              删除
                            </RowLink>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted">
          <span>
            共 {visible.filter((e) => e.is_dir).length} 个目录,
            {visible.filter((e) => !e.is_dir).length} 个文件
          </span>
          {selected.size > 0 && <span>已选 {selected.size} 项</span>}
        </div>
      </Card>

      {menu && (
        <ContextMenu
          menu={menu}
          canWrite={canWrite}
          isAdmin={isAdmin}
          clipboard={clipboard}
          onClose={() => setMenu(null)}
          onAction={(action) => {
            const e = menu.entry
            setMenu(null)
            switch (action) {
              case 'open':
                if (e.is_dir) setCwd(joinPath(cwd, e.name))
                else void openEditor(e)
                break
              case 'open-new-tab':
                openInNewTab(joinPath(cwd, e.name))
                break
              case 'download':
                void download(e)
                break
              case 'edit':
                void openEditor(e)
                break
              case 'copy':
                startCopy()
                break
              case 'cut':
                startCut()
                break
              case 'paste':
                void paste()
                break
              case 'rename':
                setDialog({ kind: 'rename', entry: e })
                break
              case 'chmod':
                setDialog({ kind: 'chmod', entries: [e] })
                break
              case 'chown':
                setDialog({ kind: 'chown', entries: [e] })
                break
              case 'compress':
                setDialog({ kind: 'compress', names: [e.name] })
                break
              case 'extract':
                setDialog({ kind: 'extract', entry: e })
                break
              case 'share':
                setSharing({ path: joinPath(cwd, e.name), isDir: e.is_dir })
                break
              case 'delete':
                void remove(e)
                break
              case 'props':
                setDialog({ kind: 'props', entry: e })
                break
            }
          }}
        />
      )}

      {dialog?.kind === 'newdir' && (
        <NameDialog
          title="新建文件夹"
          label="文件夹名称"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await apiFetch(
              `/api/m/files/mkdir?path=${encodeURIComponent(joinPath(cwd, name))}`,
              { method: 'POST' },
            )
            flash('已创建文件夹')
            setDialog(null)
            await refresh()
          }}
        />
      )}

      {dialog?.kind === 'newfile' && (
        <NameDialog
          title="新建文件"
          label="文件名"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await apiFetch(
              `/api/m/files/write?path=${encodeURIComponent(joinPath(cwd, name))}`,
              { method: 'POST', body: '' },
            )
            flash('已创建文件')
            setDialog(null)
            await refresh()
          }}
        />
      )}

      {dialog?.kind === 'rename' && (
        <NameDialog
          title="重命名"
          label="新名称"
          initial={dialog.entry.name}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await apiFetch('/api/m/files/rename', {
              method: 'POST',
              body: JSON.stringify({
                from: joinPath(cwd, dialog.entry.name),
                to: joinPath(cwd, name),
              }),
            })
            flash('已重命名')
            setDialog(null)
            await refresh()
          }}
        />
      )}

      {dialog?.kind === 'chmod' && (
        <ChmodDialog
          cwd={cwd}
          entries={dialog.entries}
          onClose={() => setDialog(null)}
          onDone={async (msg) => {
            flash(msg)
            setDialog(null)
            await refresh()
          }}
        />
      )}

      {dialog?.kind === 'chown' && (
        <ChownDialog
          cwd={cwd}
          entries={dialog.entries}
          onClose={() => setDialog(null)}
          onDone={async (msg) => {
            flash(msg)
            setDialog(null)
            await refresh()
          }}
        />
      )}

      {dialog?.kind === 'remote' && (
        <RemoteDialog
          cwd={cwd}
          onClose={() => setDialog(null)}
          onDone={async (msg) => {
            flash(msg)
            setDialog(null)
            await refresh()
          }}
        />
      )}

      {dialog?.kind === 'compress' && (
        <NameDialog
          title="压缩为 zip"
          label="目标 zip 文件名"
          initial={dialog.names.length === 1 ? `${dialog.names[0]}.zip` : 'archive.zip'}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await apiFetch('/api/m/files/compress', {
              method: 'POST',
              body: JSON.stringify({
                paths: dialog.names.map((n) => joinPath(cwd, n)),
                dest: joinPath(cwd, name),
              }),
            })
            flash(`已压缩 ${dialog.names.length} 项`)
            setDialog(null)
            await refresh()
          }}
        />
      )}

      {dialog?.kind === 'extract' && (
        <NameDialog
          title="解压到"
          label="目标子目录"
          initial={dialog.entry.name.replace(/\.[^.]+$/, '')}
          onClose={() => setDialog(null)}
          onSubmit={async (dest) => {
            await apiFetch('/api/m/files/extract', {
              method: 'POST',
              body: JSON.stringify({
                path: joinPath(cwd, dialog.entry.name),
                dest: joinPath(cwd, dest),
              }),
            })
            flash('已解压')
            setDialog(null)
            await refresh()
          }}
        />
      )}

      {dialog?.kind === 'search' && (
        <SearchDialog
          cwd={cwd}
          onClose={() => setDialog(null)}
          onPick={(rel) => {
            setDialog(null)
            setCwd(parentPath(rel))
          }}
        />
      )}

      {dialog?.kind === 'props' && (
        <PropsDialog cwd={cwd} entry={dialog.entry} onClose={() => setDialog(null)} />
      )}

      {editing && (
        <EditorModal
          initialPath={editing.path}
          initialText={editing.text}
          rootDir={cwd}
          canWrite={canWrite}
          readFileText={readFileText}
          listDir={listDir}
          writeFile={writeFile}
          mkdir={sidebarMkdir}
          createFile={sidebarCreateFile}
          onClose={() => setEditing(null)}
        />
      )}

      {sharing && (
        <ShareModal path={sharing.path} isDir={sharing.isDir} onClose={() => setSharing(null)} />
      )}

      {showShares && <ShareList onClose={() => setShowShares(false)} />}

      {showTrash && (
        <TrashModal isAdmin={isAdmin} onClose={() => setShowTrash(false)} onRestored={refresh} />
      )}
    </div>
  )
}

function DirTabs({
  tabs,
  activeId,
  onSelect,
  onAdd,
  onClose,
}: {
  tabs: DirTab[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
}) {
  const closable = tabs.length > 1
  return (
    <div
      role="tablist"
      aria-label="目录标签"
      className="flex items-center gap-1 overflow-x-auto rounded-(--radius-card) border border-border bg-surface-2/40 px-1.5 py-1.5"
    >
      {tabs.map((t) => {
        const active = t.id === activeId
        return (
          <div
            key={t.id}
            role="tab"
            tabIndex={0}
            aria-selected={active}
            title={t.path ? `/${t.path}` : '根目录'}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(t.id)
              }
            }}
            className={`group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-(--radius-sm) border px-2.5 py-1 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 ${
              active
                ? 'border-brand/50 bg-surface text-text'
                : 'border-transparent text-muted hover:bg-surface hover:text-text'
            }`}
          >
            <FolderInput size={13} className={active ? 'text-brand' : 'text-faint'} />
            <span className="max-w-40 truncate">{tabLabel(t.path)}</span>
            {closable && (
              <button
                type="button"
                aria-label={`关闭标签 ${tabLabel(t.path)}`}
                title="关闭标签"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(t.id)
                }}
                className="-mr-1 rounded p-0.5 text-faint opacity-60 transition hover:bg-surface-2 hover:text-crit group-hover:opacity-100"
              >
                <X size={13} />
              </button>
            )}
          </div>
        )
      })}
      <IconButton
        aria-label="新建标签"
        title="新建标签"
        icon={<Plus size={16} />}
        onClick={onAdd}
      />
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-muted hover:bg-surface-2 hover:text-crit' : 'text-text hover:bg-surface-2'
      }`}
    >
      <span className="text-muted">{icon}</span>
      {label}
    </button>
  )
}

function RowLink({
  onClick,
  children,
  danger,
}: {
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`text-[13px] outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 ${
        danger ? 'text-muted hover:text-crit' : 'text-muted hover:text-brand'
      }`}
    >
      {children}
    </button>
  )
}

type CtxAction =
  | 'open'
  | 'open-new-tab'
  | 'download'
  | 'edit'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'rename'
  | 'chmod'
  | 'chown'
  | 'compress'
  | 'extract'
  | 'share'
  | 'delete'
  | 'props'

function ContextMenu({
  menu,
  canWrite,
  isAdmin,
  clipboard,
  onClose,
  onAction,
}: {
  menu: Menu
  canWrite: boolean
  isAdmin: boolean
  clipboard: Clipboard
  onClose: () => void
  onAction: (a: CtxAction) => void
}) {
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const e = menu.entry
  // 视口边界内收口,避免溢出。
  const top = Math.min(menu.y, window.innerHeight - 360)
  const left = Math.min(menu.x, window.innerWidth - 200)

  return (
    <div
      className="fixed z-50 w-48 overflow-hidden rounded-(--radius-sm) border border-border bg-surface py-1 shadow-[var(--shadow-elevated)]"
      style={{ top, left }}
      onClick={(ev) => ev.stopPropagation()}
    >
      <MenuItem
        icon={e.is_dir ? <FolderInput size={15} /> : <Pencil size={15} />}
        label={e.is_dir ? '进入' : '编辑'}
        onClick={() => onAction('open')}
      />
      {e.is_dir && (
        <MenuItem
          icon={<Plus size={15} />}
          label="在新标签打开"
          onClick={() => onAction('open-new-tab')}
        />
      )}
      {!e.is_dir && (
        <MenuItem icon={<Download size={15} />} label="下载" onClick={() => onAction('download')} />
      )}
      {canWrite && (
        <>
          <MenuItem icon={<Copy size={15} />} label="复制" onClick={() => onAction('copy')} />
          <MenuItem icon={<Scissors size={15} />} label="剪切" onClick={() => onAction('cut')} />
          <MenuItem
            icon={<ClipboardPaste size={15} />}
            label="粘贴"
            disabled={!clipboard}
            onClick={() => onAction('paste')}
          />
          <MenuItem icon={<Pencil size={15} />} label="重命名" onClick={() => onAction('rename')} />
          <MenuItem icon={<FileCog size={15} />} label="权限" onClick={() => onAction('chmod')} />
          {isAdmin && (
            <MenuItem icon={<UserCog size={15} />} label="属主" onClick={() => onAction('chown')} />
          )}
          <MenuItem
            icon={<Archive size={15} />}
            label="压缩"
            onClick={() => onAction('compress')}
          />
          {!e.is_dir && isArchive(e.name) && (
            <MenuItem
              icon={<ArchiveRestore size={15} />}
              label="解压"
              onClick={() => onAction('extract')}
            />
          )}
          <MenuItem icon={<Share2 size={15} />} label="分享" onClick={() => onAction('share')} />
          <MenuItem
            icon={<Trash2 size={15} />}
            label="删除"
            danger
            onClick={() => onAction('delete')}
          />
        </>
      )}
      <MenuItem icon={<Info size={15} />} label="属性" onClick={() => onAction('props')} />
    </div>
  )
}

function NameDialog({
  title,
  label,
  initial = '',
  onClose,
  onSubmit,
}: {
  title: string
  label: string
  initial?: string
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!value.trim() || busy) return
    setBusy(true)
    setErr(null)
    try {
      await onSubmit(value.trim())
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 className="text-sm font-medium text-text">{title}</h2>
        <Input label={label} autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" disabled={busy || !value.trim()}>
            {busy ? '处理中…' : '确定'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

const PERM_BITS = [
  { key: 'owner', label: '属主 (Owner)' },
  { key: 'group', label: '组 (Group)' },
  { key: 'public', label: '公共 (Public)' },
] as const

function octalToBits(oct: string): boolean[] {
  const o = oct.padStart(3, '0').slice(-3)
  const bits: boolean[] = []
  for (const ch of o) {
    const v = Number(ch)
    bits.push((v & 4) !== 0, (v & 2) !== 0, (v & 1) !== 0)
  }
  return bits
}

function bitsToOctal(bits: boolean[]): string {
  let out = ''
  for (let g = 0; g < 3; g++) {
    let v = 0
    if (bits[g * 3]) v += 4
    if (bits[g * 3 + 1]) v += 2
    if (bits[g * 3 + 2]) v += 1
    out += String(v)
  }
  return out
}

function ChmodDialog({
  cwd,
  entries,
  onClose,
  onDone,
}: {
  cwd: string
  entries: DirEntry[]
  onClose: () => void
  onDone: (msg: string) => Promise<void>
}) {
  const initialOct = entries.length === 1 ? modeOctal(entries[0].mode) : '755'
  const initialOwner = entries.length === 1 ? entries[0].owner : ''
  const initialGroup = entries.length === 1 ? entries[0].group : ''
  const [bits, setBits] = useState<boolean[]>(octalToBits(initialOct))
  const [owner, setOwner] = useState(initialOwner)
  const [group, setGroup] = useState(initialGroup)
  const [recursive, setRecursive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const oct = bitsToOctal(bits)

  function setOctText(v: string) {
    if (/^[0-7]{0,3}$/.test(v)) setBits(octalToBits(v))
  }

  async function apply() {
    const modeChanged = oct !== initialOct
    const ownerChanged = owner.trim() !== initialOwner.trim()
    const groupChanged = group.trim() !== initialGroup.trim()
    const chownNeeded = ownerChanged || groupChanged
    if (!modeChanged && !chownNeeded) {
      await onDone('未做改动')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      for (const e of entries) {
        if (modeChanged) {
          await apiFetch('/api/m/files/chmod', {
            method: 'POST',
            body: JSON.stringify({ path: joinPath(cwd, e.name), mode: `0${oct}` }),
          })
        }
        if (chownNeeded) {
          await apiFetch('/api/m/files/chown', {
            method: 'POST',
            body: JSON.stringify({
              path: joinPath(cwd, e.name),
              owner: owner.trim(),
              group: group.trim(),
              recursive,
            }),
          })
        }
      }
      const msg =
        modeChanged && chownNeeded
          ? '权限与属主已更新'
          : modeChanged
            ? `权限已改为 ${oct}`
            : '属主已更新'
      await onDone(msg)
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">
          设置权限
          <span className="ml-2 text-muted">
            {entries.length === 1 ? entries[0].name : `${entries.length} 项`}
          </span>
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {PERM_BITS.map((group, gi) => (
            <div key={group.key} className="rounded-(--radius-sm) border border-border p-3">
              <p className="mb-2 text-xs font-medium text-muted">{group.label}</p>
              {['读 (Read)', '写 (Write)', '执行 (Execute)'].map((perm, pi) => {
                const idx = gi * 3 + pi
                return (
                  <label
                    key={perm}
                    className="flex items-center gap-2 py-0.5 text-sm text-text"
                  >
                    <input
                      type="checkbox"
                      checked={bits[idx]}
                      onChange={(e) =>
                        setBits((prev) => {
                          const next = [...prev]
                          next[idx] = e.target.checked
                          return next
                        })
                      }
                    />
                    {perm}
                  </label>
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-text">
            数字
            <input
              value={oct}
              onChange={(e) => setOctText(e.target.value)}
              className="h-9 w-20 rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 text-center font-[family-name:var(--font-mono)] text-sm text-text outline-none focus:border-brand"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="属主 (Owner)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <Input label="属组 (Group)" value={group} onChange={(e) => setGroup(e.target.value)} />
        </div>
        <p className="text-xs text-muted">属主(不改则留默认值即可,改了才生效)</p>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={recursive}
            onChange={(e) => setRecursive(e.target.checked)}
          />
          应用到子目录(递归)
        </label>
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void apply()} disabled={busy}>
            {busy ? '处理中…' : '确定'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ChownDialog({
  cwd,
  entries,
  onClose,
  onDone,
}: {
  cwd: string
  entries: DirEntry[]
  onClose: () => void
  onDone: (msg: string) => Promise<void>
}) {
  const [owner, setOwner] = useState(entries.length === 1 ? entries[0].owner : '')
  const [group, setGroup] = useState(entries.length === 1 ? entries[0].group : '')
  const [recursive, setRecursive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function apply() {
    if (!owner.trim() && !group.trim()) {
      setErr('请至少填写属主或属组')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      for (const e of entries) {
        await apiFetch('/api/m/files/chown', {
          method: 'POST',
          body: JSON.stringify({
            path: joinPath(cwd, e.name),
            owner: owner.trim(),
            group: group.trim(),
            recursive,
          }),
        })
      }
      await onDone('属主已修改')
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text">
          设置属主
          <span className="ml-2 text-muted">
            {entries.length === 1 ? entries[0].name : `${entries.length} 项`}
          </span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="属主 (Owner)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <Input label="属组 (Group)" value={group} onChange={(e) => setGroup(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={recursive}
            onChange={(e) => setRecursive(e.target.checked)}
          />
          应用到子目录(递归)
        </label>
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void apply()} disabled={busy}>
            {busy ? '处理中…' : '确定'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function RemoteDialog({
  cwd,
  onClose,
  onDone,
}: {
  cwd: string
  onClose: () => void
  onDone: (msg: string) => Promise<void>
}) {
  const [url, setUrl] = useState('https://')
  const [dest, setDest] = useState(cwd)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go() {
    if (!url.trim() || busy) return
    if (!window.confirm('远程下载会从外部 URL 拉取文件到服务器,确认继续?')) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/m/files/remote-download', {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({ url: url.trim(), dest: dest.trim(), name: name.trim() }),
      })
      await onDone('已开始远程下载')
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text">远程下载</h2>
        <Input label="URL 地址" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input label="保存到目录(相对根)" value={dest} onChange={(e) => setDest(e.target.value)} />
        <Input
          label="文件名(留空从 URL 推断)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void go()} disabled={busy || !url.trim()}>
            {busy ? '处理中…' : '确认下载'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function SearchDialog({
  cwd,
  onClose,
  onPick,
}: {
  cwd: string
  onClose: () => void
  onPick: (rel: string) => void
}) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<string[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    if (!name.trim() && !content.trim()) {
      setErr('请填写文件名或内容')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const q = new URLSearchParams({ path: cwd })
      if (name.trim()) q.set('name', name.trim())
      if (content.trim()) q.set('content', content.trim())
      const r = await apiFetch<string[]>(`/api/m/files/search?${q.toString()}`)
      setResults(r)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text">搜索文件</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="文件名(glob,如 *.php)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="文件内容(可选)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted">在「{cwd || '根目录'}」下递归搜索。</p>
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            关闭
          </Button>
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? '搜索中…' : '搜索'}
          </Button>
        </div>
        {results && (
          <div className="max-h-72 overflow-auto rounded-(--radius-sm) border border-border">
            {results.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted">无匹配结果。</p>
            ) : (
              results.map((rel) => (
                <button
                  key={rel}
                  onClick={() => onPick(rel)}
                  className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-sm text-text last:border-b-0 hover:bg-surface-2"
                >
                  <FileIcon name={baseName(rel)} isDir={false} size={15} />
                  <span className="truncate font-[family-name:var(--font-mono)] text-xs">
                    {rel}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function PropsDialog({
  cwd,
  entry,
  onClose,
}: {
  cwd: string
  entry: DirEntry
  onClose: () => void
}) {
  const [size, setSize] = useState<DirSize | null>(null)
  const [busy, setBusy] = useState(false)

  async function calc() {
    setBusy(true)
    try {
      setSize(
        await apiFetch<DirSize>(
          `/api/m/files/dirsize?path=${encodeURIComponent(joinPath(cwd, entry.name))}`,
        ),
      )
    } catch {
      // 计算失败不致命,忽略。
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-text">
          <FileIcon name={entry.name} isDir={entry.is_dir} />
          属性 · {entry.name}
        </h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">类型</dt>
          <dd className="text-text">{entry.is_dir ? '目录' : '文件'}</dd>
          <dt className="text-muted">位置</dt>
          <dd className="truncate font-[family-name:var(--font-mono)] text-xs text-text">
            /{joinPath(cwd, entry.name)}
          </dd>
          <dt className="text-muted">大小</dt>
          <dd className="text-text">
            {entry.is_dir ? (
              size ? (
                `${formatBytes(size.bytes)} · ${size.files} 文件 / ${size.dirs} 目录`
              ) : (
                <Button size="sm" variant="ghost" onClick={() => void calc()} disabled={busy}>
                  {busy ? '计算中…' : '计算大小'}
                </Button>
              )
            ) : (
              `${formatBytes(entry.size)} (${entry.size} 字节)`
            )}
          </dd>
          <dt className="text-muted">权限</dt>
          <dd className="font-[family-name:var(--font-mono)] text-text">{modeOctal(entry.mode)}</dd>
          <dt className="text-muted">属主</dt>
          <dd className="text-text">
            {entry.owner}:{entry.group}
          </dd>
          <dt className="text-muted">修改时间</dt>
          <dd className="text-text">{fmtTime(entry.mod_time)}</dd>
        </dl>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function TrashModal({
  isAdmin,
  onClose,
  onRestored,
}: {
  isAdmin: boolean
  onClose: () => void
  onRestored: () => Promise<void>
}) {
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setItems(await apiFetch<TrashItem[]>('/api/m/files/trash'))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function restore(id: string) {
    try {
      await apiFetch('/api/m/files/trash/restore', {
        method: 'POST',
        body: JSON.stringify({ id }),
      })
      await load()
      await onRestored()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function empty() {
    if (!window.confirm('确认清空回收站?所有条目将被永久删除,不可恢复。')) return
    try {
      await apiFetch('/api/m/files/trash/empty', { method: 'POST', headers: DANGER })
      await load()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text">回收站</h2>
          {isAdmin && items.length > 0 && (
            <Button size="sm" variant="danger" onClick={() => void empty()}>
              清空回收站
            </Button>
          )}
        </div>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : err ? (
          <p className="text-sm text-crit">{err}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">回收站为空。</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-(--radius-sm) border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-3 py-2 text-left font-medium">原路径</th>
                  <th className="px-3 py-2 text-right font-medium">大小</th>
                  <th className="px-3 py-2 text-left font-medium">删除时间</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <FileIcon name={baseName(it.orig_path)} isDir={it.is_dir} size={15} />
                        <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">
                          /{it.orig_path}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted">
                      {it.is_dir ? '—' : formatBytes(it.size)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{fmtTime(it.deleted_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <RowLink onClick={() => void restore(it.id)}>还原</RowLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-(--radius-card) border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// 编辑器内单文件的可编辑缓冲:text 为当前内容,saved 为最后保存值,dirty = 二者不等。
type OpenFile = { path: string; text: string; saved: string }

type WindowState = 'normal' | 'maximized' | 'minimized'

const FONT_SIZE = 13

function EditorModal({
  initialPath,
  initialText,
  rootDir,
  canWrite,
  readFileText,
  listDir,
  writeFile,
  mkdir,
  createFile,
  onClose,
}: {
  initialPath: string
  initialText: string
  rootDir: string
  canWrite: boolean
  readFileText: (path: string) => Promise<string>
  listDir: (path: string) => Promise<DirEntry[]>
  writeFile: (path: string, text: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
  createFile: (path: string) => Promise<void>
  onClose: () => void
}) {
  const editorRef = useRef<CodeEditorViewHandle>(null)
  const [file, setFile] = useState<OpenFile>({
    path: initialPath,
    text: initialText,
    saved: initialText,
  })
  const [wrap, setWrap] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [windowState, setWindowState] = useState<WindowState>('normal')
  const [searchOpen, setSearchOpen] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [searchFocus, setSearchFocus] = useState(0)
  const [cursor, setCursor] = useState<CursorStats>({
    line: 1,
    col: 1,
    chars: initialText.length,
  })

  const dirty = file.text !== file.saved
  const lang = languageFromFilename(file.path)
  const onCursor = useCallback((s: CursorStats) => setCursor(s), [])

  const closeWithConfirm = useCallback(() => {
    if (dirty && !window.confirm('有未保存的改动,确认关闭?')) return
    onClose()
  }, [dirty, onClose])

  function openSearch(replace: boolean) {
    setSearchOpen(true)
    if (replace) setShowReplace(true)
    setSearchFocus((n) => n + 1)
  }

  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    setErr(null)
    try {
      await writeFile(file.path, file.text)
      setFile((f) => ({ ...f, saved: f.text }))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  // reload 从磁盘重新拉取当前文件内容并重置未保存态;有脏改动先确认放弃。
  async function reload() {
    if (reloading) return
    if (dirty && !window.confirm('放弃未保存的改动并重新加载?')) return
    setReloading(true)
    setErr(null)
    try {
      const text = await readFileText(file.path)
      setFile((f) => ({ ...f, text, saved: text }))
      setCursor({ line: 1, col: 1, chars: text.length })
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setReloading(false)
    }
  }

  // 在编辑器内打开另一个文件:有未保存改动先确认;读取失败提示但不切换。
  async function openFile(path: string) {
    if (path === file.path) return
    if (dirty && !window.confirm('有未保存的改动,确认放弃并打开其他文件?')) return
    setErr(null)
    try {
      const text = await readFileText(path)
      setFile({ path, text, saved: text })
      setCursor({ line: 1, col: 1, chars: text.length })
    } catch (e) {
      setErr(errorText(e))
    }
  }

  // 编辑器级快捷键:Ctrl/Cmd+F 查找、Ctrl/Cmd+H 替换、Esc 关搜索栏(关着时不关编辑器)。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        openSearch(false)
      } else if (mod && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault()
        openSearch(true)
      } else if (e.key === 'Escape') {
        if (searchOpen) {
          e.preventDefault()
          setSearchOpen(false)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  // 最小化:左下角小条,显示文件名 + 还原,内容保留(组件不卸载)。
  if (windowState === 'minimized') {
    return (
      <div className="fixed bottom-3 left-3 z-50 flex max-w-[min(90vw,320px)] items-center gap-2 rounded-(--radius-card) border border-border bg-surface px-3 py-2 shadow-[var(--shadow-elevated)]">
        <FileIcon name={file.path} isDir={false} size={16} />
        <span
          className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-xs text-text"
          title={file.path}
        >
          {baseName(file.path)}
          {dirty && <span className="ml-1 text-warn">●</span>}
        </span>
        <IconButton
          aria-label="还原"
          title="还原"
          icon={<Maximize2 size={15} />}
          onClick={() => setWindowState('normal')}
        />
        <IconButton
          aria-label="关闭"
          title="关闭"
          icon={<X size={16} />}
          onClick={closeWithConfirm}
          className="hover:text-crit"
        />
      </div>
    )
  }

  const maximized = windowState === 'maximized'
  const shellCls = maximized
    ? 'fixed inset-0 z-50'
    : 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6'
  const panelCls = maximized
    ? 'flex h-full w-full flex-col overflow-hidden border border-border bg-surface'
    : 'flex h-[92vh] w-[94vw] max-w-[1400px] flex-col overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-[var(--shadow-elevated)]'

  return (
    <div className={shellCls}>
      <div className={panelCls}>
        {/* 顶部工具栏 */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-2/50 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <FileIcon name={file.path} isDir={false} size={15} />
            <span
              className="truncate font-[family-name:var(--font-mono)] text-xs text-muted"
              title={file.path}
            >
              {file.path}
            </span>
            <span className="shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-muted">
              {languageLabel(lang)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" onClick={() => void save()} disabled={saving || !dirty} title="保存 (Ctrl/Cmd+S)">
              {dirty && !saving && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
              )}
              <Save size={14} />
              {saving ? '保存中…' : '保存'}
            </Button>
            <IconButton
              aria-label="重新加载"
              title="从磁盘重新加载"
              icon={<RefreshCw size={15} className={reloading ? 'animate-spin' : ''} />}
              onClick={() => void reload()}
              disabled={reloading}
            />
            <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            <IconButton
              aria-label="查找 / 替换"
              title="查找 / 替换 (Ctrl+F)"
              icon={<Search size={15} />}
              onClick={() => (searchOpen ? setSearchOpen(false) : openSearch(false))}
              className={searchOpen ? 'bg-brand-soft text-brand' : ''}
            />
            <IconButton
              aria-label="自动换行"
              title={wrap ? '关闭自动换行' : '开启自动换行'}
              icon={<WrapText size={15} />}
              onClick={() => setWrap((v) => !v)}
              className={wrap ? 'bg-brand-soft text-brand' : ''}
            />
            <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            <IconButton
              aria-label="最小化"
              title="最小化到左下角"
              icon={<Minus size={15} />}
              onClick={() => setWindowState('minimized')}
            />
            {maximized ? (
              <IconButton
                aria-label="还原"
                title="还原"
                icon={<Minimize2 size={15} />}
                onClick={() => setWindowState('normal')}
              />
            ) : (
              <IconButton
                aria-label="最大化"
                title="最大化"
                icon={<Maximize2 size={15} />}
                onClick={() => setWindowState('maximized')}
              />
            )}
            <button
              type="button"
              aria-label="关闭"
              title="关闭"
              onClick={closeWithConfirm}
              disabled={saving}
              className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-(--radius-sm) text-muted transition hover:bg-surface-2 hover:text-crit disabled:opacity-40"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* 主体:左侧文件树 + 右侧编辑区 */}
        <div className="flex min-h-0 flex-1">
          <div className="w-60 shrink-0">
            <FileTreeSidebar
              rootDir={rootDir}
              activePath={file.path}
              canWrite={canWrite}
              listDir={listDir}
              onOpenFile={(p) => void openFile(p)}
              mkdir={mkdir}
              createFile={createFile}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {err && (
              <p className="border-b border-border bg-crit/10 px-3 py-1.5 text-xs text-crit">{err}</p>
            )}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {searchOpen && (
                <Suspense fallback={null}>
                  <SearchBar
                    view={editorRef.current?.getView() ?? null}
                    showReplace={showReplace}
                    onToggleReplace={() => setShowReplace((v) => !v)}
                    onClose={() => setSearchOpen(false)}
                    focusSignal={searchFocus}
                  />
                </Suspense>
              )}
              <CodeEditor
                key={file.path}
                ref={editorRef}
                bare
                value={file.text}
                onChange={(t) => setFile((f) => ({ ...f, text: t }))}
                filename={file.path}
                onSave={() => void save()}
                height="100%"
                lineWrap={wrap}
                fontSize={FONT_SIZE}
                onCursor={onCursor}
              />
            </div>
          </div>
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center gap-4 border-t border-border bg-surface-2/50 px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] text-muted">
          <span>
            行 {cursor.line}:{cursor.col}
          </span>
          <span>{languageLabel(lang)}</span>
          <span>{cursor.chars} 字符</span>
          <span className="ml-auto">UTF-8</span>
          {dirty ? (
            <span className="text-warn">未保存</span>
          ) : (
            <span className="text-online">已保存</span>
          )}
        </div>
      </div>
    </div>
  )
}


function ShareModal({
  path,
  isDir,
  onClose,
}: {
  path: string
  isDir: boolean
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [allowList, setAllowList] = useState(isDir)
  const [expiresHours, setExpiresHours] = useState('')
  const [maxDownloads, setMaxDownloads] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      const share = await apiFetch<Share>('/api/m/files/shares', {
        method: 'POST',
        body: JSON.stringify({
          path,
          password,
          allow_list: allowList,
          expires_in_sec: expiresHours ? Math.round(Number(expiresHours) * 3600) : 0,
          max_downloads: maxDownloads ? Number(maxDownloads) : 0,
        }),
      })
      setLink(`${location.origin}/s/${share.token}`)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="truncate text-sm font-medium text-text">创建分享 · {path}</h2>
        {link ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-online">分享链接已创建:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded border border-border bg-surface-2 px-3 py-2 font-[family-name:var(--font-mono)] text-xs text-text">
                {link}
              </code>
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(link)
                  setCopied(true)
                }}
              >
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
          </div>
        ) : (
          <>
            <Input
              label="访问密码(可选)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="有效期(小时,留空永久)"
                inputMode="numeric"
                value={expiresHours}
                onChange={(e) => setExpiresHours(e.target.value)}
              />
              <Input
                label="下载次数上限(留空不限)"
                inputMode="numeric"
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value)}
              />
            </div>
            {isDir && (
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={allowList}
                  onChange={(e) => setAllowList(e.target.checked)}
                />
                允许列目录
              </label>
            )}
            {err && <p className="text-sm text-crit">{err}</p>}
            <div className="flex items-center gap-2">
              <Button onClick={() => void create()} disabled={busy}>
                创建分享
              </Button>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                取消
              </Button>
              {busy && <Spinner size={16} />}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function ShareList({ onClose }: { onClose: () => void }) {
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setShares(await apiFetch<Share[]>('/api/m/files/shares'))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function revoke(token: string) {
    if (!window.confirm('确认撤销此分享?链接将立即失效。')) return
    try {
      await apiFetch(`/api/m/files/shares/${token}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text">已创建的分享</h2>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : err ? (
          <p className="text-sm text-crit">{err}</p>
        ) : shares.length === 0 ? (
          <p className="text-sm text-muted">暂无分享。</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {shares.map((s) => (
              <div key={s.token} className="flex items-center gap-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm text-text">{s.path}</span>
                  <code className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                    {location.origin}/s/{s.token}
                  </code>
                  <span className="text-xs text-muted">
                    {s.has_password ? '有密码 · ' : ''}
                    {s.allow_list ? '可列目录 · ' : ''}
                    下载 {s.downloads}
                    {s.max_downloads ? `/${s.max_downloads}` : ''}
                    {s.expires_at ? ` · 过期 ${fmtTime(s.expires_at)}` : ' · 永久'}
                  </span>
                </div>
                <Button size="sm" variant="danger" onClick={() => void revoke(s.token)}>
                  撤销
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      </div>
    </Modal>
  )
}
