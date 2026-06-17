import { lazy, Suspense, useMemo } from 'react'
import { Spinner } from './Spinner'
import {
  type EditorLanguage,
  languageFromFilename,
} from './codeEditorLang'

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
}

/** CodeEditor:基于 CodeMirror 6 的可复用代码编辑器(懒加载)。 */
export function CodeEditor({
  value,
  onChange,
  language,
  filename,
  readOnly,
  onSave,
  height,
}: CodeEditorProps) {
  const lang = useMemo<EditorLanguage>(
    () => language ?? (filename ? languageFromFilename(filename) : 'text'),
    [language, filename],
  )

  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center rounded-(--radius-card) border border-border bg-surface"
          style={{ height: height ?? '60vh' }}
        >
          <Spinner size={20} />
        </div>
      }
    >
      <div className="overflow-hidden rounded-(--radius-card) border border-border">
        <CodeEditorView
          value={value}
          onChange={onChange}
          language={lang}
          readOnly={readOnly}
          onSave={onSave}
          height={height}
        />
      </div>
    </Suspense>
  )
}
