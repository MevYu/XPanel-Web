import { forwardRef, lazy, Suspense, useMemo } from 'react'
import { Spinner } from './Spinner'
import {
  type EditorLanguage,
  languageFromFilename,
} from './codeEditorLang'
import type {
  CodeEditorViewHandle,
  CursorStats,
} from './CodeEditorView'

export type { CodeEditorViewHandle, CursorStats }

// 懒加载真正的 CodeMirror 视图,把 codemirror 及语言包移出首屏主包(单独成 chunk)。
const CodeEditorView = lazy(() => import('./CodeEditorView'))

export type CodeEditorProps = {
  value: string
  onChange?: (value: string) => void
  /** 显式指定语言;给了 filename 会按扩展名识别,language 优先。 */
  language?: EditorLanguage
  filename?: string
  readOnly?: boolean
  onSave?: () => void
  height?: string
  lineWrap?: boolean
  fontSize?: number
  onCursor?: (stats: CursorStats) => void
  /** bare:去掉外圈圆角与边框,代码区与外层容器齐边(嵌在已有窗口内时用)。 */
  bare?: boolean
}

/** CodeEditor:基于 CodeMirror 6 的可复用代码编辑器(懒加载)。 */
export const CodeEditor = forwardRef<CodeEditorViewHandle, CodeEditorProps>(
  function CodeEditor(
    { value, onChange, language, filename, readOnly, onSave, height, lineWrap, fontSize, onCursor, bare },
    ref,
  ) {
    const lang = useMemo<EditorLanguage>(
      () => language ?? (filename ? languageFromFilename(filename) : 'text'),
      [language, filename],
    )

    const wrapperCls = bare
      ? 'h-full overflow-hidden [&_.cm-theme]:h-full'
      : 'overflow-hidden rounded-(--radius-card) border border-border'
    const fallbackCls = bare
      ? 'flex h-full items-center justify-center bg-surface'
      : 'flex items-center justify-center rounded-(--radius-card) border border-border bg-surface'

    return (
      <Suspense
        fallback={
          <div className={fallbackCls} style={{ height: height ?? '60vh' }}>
            <Spinner size={20} />
          </div>
        }
      >
        <div className={wrapperCls}>
          <CodeEditorView
            ref={ref}
            value={value}
            onChange={onChange}
            language={lang}
            readOnly={readOnly}
            onSave={onSave}
            height={height}
            lineWrap={lineWrap}
            fontSize={fontSize}
            onCursor={onCursor}
          />
        </div>
      </Suspense>
    )
  },
)
