import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

// 配色取自 global.css 的 @theme token(bg/surface/border/text/muted/brand),
// 不引第三方主题色,保持与面板暗色一致。
const bg = '#10151D' // 介于 --color-bg 与 --color-surface,编辑区底
const gutterBg = '#0C1118' // 行号区,比编辑区更暗
const surface2 = '#1D2531' // --color-surface-2
const text = '#E8EEF5' // --color-text
const muted = '#8593A6' // --color-muted
const faint = '#5C6878' // --color-faint
const border = '#2C3643' // --color-border
const brand = '#6E8BFF' // --color-brand
const brandBright = '#8FA5FF' // --color-brand-bright
const selection = 'rgba(110, 139, 255, 0.22)'
const activeLine = 'rgba(110, 139, 255, 0.06)'
const matchBg = 'rgba(110, 139, 255, 0.28)'

const theme = EditorView.theme(
  {
    '&': { color: text, backgroundColor: bg, fontSize: '13px' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
    '.cm-content': { caretColor: brandBright, padding: '6px 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: brandBright, borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: selection },
    '.cm-activeLine': { backgroundColor: activeLine },
    '.cm-activeLineGutter': { backgroundColor: activeLine, color: text },
    '.cm-gutters': {
      backgroundColor: gutterBg,
      color: faint,
      border: 'none',
      borderRight: `1px solid ${border}`,
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 14px', minWidth: '34px' },
    '.cm-foldGutter .cm-gutterElement': { color: muted },
    '.cm-foldGutter .cm-gutterElement:hover': { color: brandBright },
    // 缩进参考线(若 indentationMarkers 扩展启用则配色协调;原生不绘也无害)。
    '.cm-foldPlaceholder': {
      backgroundColor: surface2,
      border: `1px solid ${border}`,
      color: muted,
      margin: '0 4px',
      borderRadius: '4px',
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: matchBg,
      outline: `1px solid ${brand}`,
    },
    '.cm-selectionMatch': { backgroundColor: 'rgba(110, 139, 255, 0.14)' },
    '.cm-panels': { backgroundColor: surface2, color: text, borderColor: border },
    '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${border}` },
    '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${border}` },
    '.cm-search': { padding: '8px 10px' },
    '.cm-search label': { color: muted, fontSize: '12px' },
    '.cm-textfield': {
      backgroundColor: '#0C1118',
      border: `1px solid ${border}`,
      borderRadius: '6px',
      color: text,
      padding: '3px 8px',
    },
    '.cm-textfield:focus': { borderColor: brand, outline: 'none' },
    '.cm-button': {
      backgroundColor: surface2,
      backgroundImage: 'none',
      border: `1px solid ${border}`,
      borderRadius: '6px',
      color: text,
      padding: '3px 10px',
    },
    '.cm-button:hover': { backgroundColor: '#26303D', borderColor: '#3A4655' },
    '.cm-search .cm-button:active': { backgroundColor: '#0C1118' },
    '.cm-search .cm-button[name="close"], .cm-panel.cm-search button[name="close"]': {
      color: muted,
    },
    '.cm-searchMatch': { backgroundColor: matchBg, borderRadius: '2px' },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(143, 165, 255, 0.45)',
    },
    '.cm-tooltip': {
      backgroundColor: surface2,
      border: `1px solid ${border}`,
      color: text,
      borderRadius: '8px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'rgba(110, 139, 255, 0.18)',
      color: text,
    },
  },
  { dark: true },
)

const highlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: faint, fontStyle: 'italic' },
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
