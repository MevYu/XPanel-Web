import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

// 配色取自 global.css 的 @theme token(bg/surface/border/text/muted/brand),
// 不引第三方主题色,保持与面板暗色一致。
const bg = '#10151D' // --color-surface
const gutterBg = '#0A0E13' // --color-bg
const text = '#E8EEF5' // --color-text
const muted = '#8593A6' // --color-muted
const border = '#232C39' // --color-border
const brand = '#6E8BFF' // --color-brand
const brandBright = '#8FA5FF' // --color-brand-bright
const selection = 'rgba(110, 139, 255, 0.20)'
const activeLine = 'rgba(110, 139, 255, 0.07)' // --color-brand-faint

const theme = EditorView.theme(
  {
    '&': { color: text, backgroundColor: bg, fontSize: '13px' },
    '.cm-content': {
      caretColor: brandBright,
      fontFamily: 'var(--font-mono)',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: brandBright },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: selection },
    '.cm-activeLine': { backgroundColor: activeLine },
    '.cm-activeLineGutter': { backgroundColor: activeLine, color: text },
    '.cm-gutters': {
      backgroundColor: gutterBg,
      color: muted,
      border: 'none',
      borderRight: `1px solid ${border}`,
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'rgba(110, 139, 255, 0.25)',
      outline: `1px solid ${brand}`,
    },
    '.cm-panels': { backgroundColor: gutterBg, color: text },
    '.cm-searchMatch': { backgroundColor: 'rgba(110, 139, 255, 0.25)' },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(143, 165, 255, 0.4)',
    },
    '.cm-tooltip': {
      backgroundColor: '#18202B',
      border: `1px solid ${border}`,
      color: text,
    },
  },
  { dark: true },
)

const highlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: muted, fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: brand },
  { tag: [t.string, t.special(t.string)], color: '#7FD1B9' },
  { tag: [t.number, t.bool, t.null], color: '#E0A458' },
  { tag: [t.variableName, t.propertyName], color: text },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: brandBright },
  { tag: [t.typeName, t.className, t.tagName], color: '#9C7BD9' },
  { tag: [t.attributeName], color: '#E0A458' },
  { tag: [t.operator, t.punctuation], color: muted },
  { tag: [t.definitionKeyword, t.atom], color: brandBright },
  { tag: t.heading, color: brandBright, fontWeight: 'bold' },
  { tag: t.link, color: brand, textDecoration: 'underline' },
  { tag: t.invalid, color: '#F87171' },
])

export const xpanelDark: Extension = [theme, syntaxHighlighting(highlight)]
