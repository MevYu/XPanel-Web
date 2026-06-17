import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import CodeMirror, {
  type Extension,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { search } from '@codemirror/search'
import { javascript, json, typescript } from '@codemirror/legacy-modes/mode/javascript'
import { css } from '@codemirror/legacy-modes/mode/css'
import { xml } from '@codemirror/legacy-modes/mode/xml'
import { python } from '@codemirror/legacy-modes/mode/python'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { nginx } from '@codemirror/legacy-modes/mode/nginx'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { go } from '@codemirror/legacy-modes/mode/go'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { php } from '@codemirror/lang-php'
import { markdown } from '@codemirror/lang-markdown'
import type { EditorLanguage } from './codeEditorLang'
import { xpanelDark } from './codeEditorTheme'

/** 把语言标识映射到 CodeMirror 扩展;未知返回纯文本(空扩展)。 */
function languageExtension(lang: EditorLanguage): Extension {
  switch (lang) {
    case 'javascript':
      return StreamLanguage.define(javascript)
    case 'typescript':
      return StreamLanguage.define(typescript)
    case 'json':
      return StreamLanguage.define(json)
    case 'css':
      return StreamLanguage.define(css)
    case 'html':
      return StreamLanguage.define(xml)
    case 'python':
      return StreamLanguage.define(python)
    case 'shell':
      return StreamLanguage.define(shell)
    case 'nginx':
      return StreamLanguage.define(nginx)
    case 'yaml':
      return StreamLanguage.define(yaml)
    case 'sql':
      return StreamLanguage.define(standardSQL)
    case 'go':
      return StreamLanguage.define(go)
    case 'ini':
      return StreamLanguage.define(properties)
    case 'php':
      return php()
    case 'markdown':
      return markdown()
    default:
      return []
  }
}

/** 光标统计:1 基行/列、总字符数。 */
export type CursorStats = { line: number; col: number; chars: number }

export type CodeEditorViewHandle = {
  /** 返回底层 EditorView,供自绘搜索栏命令式驱动 @codemirror/search。 */
  getView: () => EditorView | null
}

export type CodeEditorViewProps = {
  value: string
  onChange?: (value: string) => void
  language: EditorLanguage
  readOnly?: boolean
  onSave?: () => void
  height?: string
  lineWrap?: boolean
  fontSize?: number
  onCursor?: (stats: CursorStats) => void
}

function CodeEditorViewInner(
  {
    value,
    onChange,
    language,
    readOnly = false,
    onSave,
    height = '60vh',
    lineWrap = true,
    fontSize,
    onCursor,
  }: CodeEditorViewProps,
  ref: React.Ref<CodeEditorViewHandle>,
) {
  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const fillHeight = height === '100%'

  useImperativeHandle(ref, () => ({
    getView: () => cmRef.current?.view ?? null,
  }))

  const extensions = useMemo(() => {
    const exts: Extension[] = [languageExtension(language), search({ top: true })]
    if (fillHeight) {
      exts.push(
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      )
    }
    if (lineWrap) exts.push(EditorView.lineWrapping)
    if (fontSize) {
      exts.push(EditorView.theme({ '&': { fontSize: `${fontSize}px` } }))
    }
    if (onCursor) {
      exts.push(
        EditorView.updateListener.of((u) => {
          if (!u.docChanged && !u.selectionSet) return
          const head = u.state.selection.main.head
          const line = u.state.doc.lineAt(head)
          onCursor({
            line: line.number,
            col: head - line.from + 1,
            chars: u.state.doc.length,
          })
        }),
      )
    }
    if (onSave) {
      // 高优先级 keymap,确保 Ctrl/Cmd+S 在浏览器默认保存对话框之前触发。
      exts.push(
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                onSave()
                return true
              },
            },
          ]),
        ),
      )
    }
    return exts
  }, [language, onSave, lineWrap, fontSize, onCursor, fillHeight])

  return (
    <CodeMirror
      ref={cmRef}
      value={value}
      height={height}
      theme={xpanelDark}
      readOnly={readOnly}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        bracketMatching: true,
        highlightActiveLineGutter: true,
        // 内置 search keymap 关闭:改用 @codemirror/search 的面板(顶部),避免双绑。
        searchKeymap: false,
        foldGutter: true,
      }}
    />
  )
}

export default forwardRef(CodeEditorViewInner)
