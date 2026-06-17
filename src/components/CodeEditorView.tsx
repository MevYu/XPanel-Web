import { useMemo } from 'react'
import CodeMirror, { type Extension } from '@uiw/react-codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
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

export type CodeEditorViewProps = {
  value: string
  onChange?: (value: string) => void
  language: EditorLanguage
  readOnly?: boolean
  onSave?: () => void
  height?: string
}

export default function CodeEditorView({
  value,
  onChange,
  language,
  readOnly = false,
  onSave,
  height = '60vh',
}: CodeEditorViewProps) {
  const extensions = useMemo(() => {
    const exts: Extension[] = [languageExtension(language), EditorView.lineWrapping]
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
  }, [language, onSave])

  return (
    <CodeMirror
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
        searchKeymap: true,
        foldGutter: false,
      }}
    />
  )
}
