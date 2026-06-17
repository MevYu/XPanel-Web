import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from '@codemirror/search'
import {
  ArrowUp,
  ArrowDown,
  CaseSensitive,
  Regex,
  WholeWord,
  Replace,
  ReplaceAll,
  X,
} from 'lucide-react'

/**
 * SearchBar 自绘查找/替换栏,直接驱动 @codemirror/search 的命令式 API
 * (SearchQuery/setSearchQuery/findNext/findPrevious/replaceNext/replaceAll),
 * 不使用 CodeMirror 默认 search 面板,UI 完全可控。
 *
 * showReplace 由外部控制(Ctrl+H 或点"替换"展开);view 为目标编辑器视图。
 */
export function SearchBar({
  view,
  showReplace,
  onToggleReplace,
  onClose,
  focusSignal,
}: {
  view: EditorView | null
  showReplace: boolean
  onToggleReplace: () => void
  onClose: () => void
  /** 每次自增触发查找框重新聚焦(打开搜索栏时)。 */
  focusSignal: number
}) {
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regexp, setRegexp] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const findRef = useRef<HTMLInputElement>(null)

  const query = useMemo(
    () =>
      new SearchQuery({
        search: find,
        replace,
        caseSensitive,
        regexp,
        wholeWord,
      }),
    [find, replace, caseSensitive, regexp, wholeWord],
  )

  // 查询变化即推给编辑器,驱动高亮;空查询也推(清除高亮)。
  useEffect(() => {
    if (!view) return
    view.dispatch({ effects: setSearchQuery.of(query) })
  }, [view, query])

  useEffect(() => {
    findRef.current?.focus()
    findRef.current?.select()
  }, [focusSignal])

  // 统计匹配数与当前序号:用 query.getCursor 数全文,光标位置定位 current。
  const { total, current } = useMemo(() => {
    if (!view || !find || !query.valid) return { total: 0, current: 0 }
    try {
      const { state } = view
      const sel = state.selection.main
      const cursor = query.getCursor(state)
      let count = 0
      let cur = 0
      for (let next = cursor.next(); !next.done; next = cursor.next()) {
        const { from, to } = next.value
        count++
        if (from === sel.from && to === sel.to) cur = count
      }
      return { total: count, current: cur }
    } catch {
      return { total: 0, current: 0 }
    }
  }, [view, query, find])

  function run(fn: (v: EditorView) => boolean) {
    if (view) {
      fn(view)
      view.focus()
    }
  }

  function onFindKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (view) (e.shiftKey ? findPrevious : findNext)(view)
    }
  }

  const inputCls =
    'h-9 min-w-0 flex-1 rounded-(--radius-sm) border border-border bg-[#0C1118] px-3 font-[family-name:var(--font-mono)] text-[13px] text-text outline-none focus:border-brand'

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-surface-2/60 px-3 py-2.5">
      {/* 查找行 */}
      <div className="flex items-center gap-2">
        <input
          ref={findRef}
          value={find}
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={onFindKey}
          placeholder="查找"
          className={inputCls}
        />
        <span className="w-20 shrink-0 text-center font-[family-name:var(--font-mono)] text-xs text-muted">
          {find ? `${current}/${total}` : '0/0'}
        </span>
        <IconBtn
          title="上一个 (Shift+Enter)"
          onClick={() => run(findPrevious)}
          icon={<ArrowUp size={15} />}
        />
        <IconBtn
          title="下一个 (Enter)"
          onClick={() => run(findNext)}
          icon={<ArrowDown size={15} />}
        />
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <Toggle
          active={caseSensitive}
          onClick={() => setCaseSensitive((v) => !v)}
          title="区分大小写"
          icon={<CaseSensitive size={16} />}
        />
        <Toggle
          active={regexp}
          onClick={() => setRegexp((v) => !v)}
          title="正则表达式"
          icon={<Regex size={16} />}
        />
        <Toggle
          active={wholeWord}
          onClick={() => setWholeWord((v) => !v)}
          title="全词匹配"
          icon={<WholeWord size={16} />}
        />
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <Toggle
          active={showReplace}
          onClick={onToggleReplace}
          title="切换替换 (Ctrl+H)"
          icon={<Replace size={16} />}
        />
        <IconBtn title="关闭搜索栏 (Esc)" onClick={onClose} icon={<X size={16} />} />
      </div>
      {/* 替换行:仅展开时出现 */}
      {showReplace && (
        <div className="flex items-center gap-2">
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            placeholder="替换为"
            className={inputCls}
          />
          <span className="w-20 shrink-0" aria-hidden />
          <IconBtn title="替换当前" onClick={() => run(replaceNext)} icon={<Replace size={15} />} />
          <IconBtn title="全部替换" onClick={() => run(replaceAll)} icon={<ReplaceAll size={15} />} />
        </div>
      )}
    </div>
  )
}

function IconBtn({
  title,
  onClick,
  icon,
}: {
  title: string
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-sm) text-muted transition hover:bg-surface-2 hover:text-text"
    >
      {icon}
    </button>
  )
}

// Toggle 选项按钮:复选框语义(区分大小写/正则/全词/替换),激活态高亮;
// inline-flex + items-center 保证图标与按钮在同一水平线垂直居中。
function Toggle({
  active,
  onClick,
  title,
  icon,
}: {
  active: boolean
  onClick: () => void
  title: string
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      aria-label={title}
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-sm) border transition ${
        active
          ? 'border-brand/50 bg-brand-soft text-brand'
          : 'border-transparent text-muted hover:bg-surface-2 hover:text-text'
      }`}
    >
      {icon}
    </button>
  )
}
