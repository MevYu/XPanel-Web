// 编辑器语言标识。'text' 为纯文本兜底。
export type EditorLanguage =
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'css'
  | 'html'
  | 'php'
  | 'python'
  | 'shell'
  | 'nginx'
  | 'yaml'
  | 'markdown'
  | 'sql'
  | 'go'
  | 'ini'
  | 'text'

const EXT_MAP: Record<string, EditorLanguage> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  css: 'css',
  scss: 'css',
  less: 'css',
  html: 'html',
  htm: 'html',
  xml: 'html',
  vue: 'html',
  php: 'php',
  py: 'python',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  conf: 'nginx',
  nginx: 'nginx',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  sql: 'sql',
  go: 'go',
  ini: 'ini',
  toml: 'ini',
  env: 'ini',
  properties: 'ini',
}

// 按文件名(取扩展名)识别编辑器语言;识别不了返回 'text'。
export function languageFromFilename(filename: string): EditorLanguage {
  const base = filename.split('/').pop() ?? filename
  const dot = base.lastIndexOf('.')
  if (dot < 0) return 'text'
  const ext = base.slice(dot + 1).toLowerCase()
  return EXT_MAP[ext] ?? 'text'
}

const LABELS: Record<EditorLanguage, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  css: 'CSS',
  html: 'HTML',
  php: 'PHP',
  python: 'Python',
  shell: 'Shell',
  nginx: 'Nginx',
  yaml: 'YAML',
  markdown: 'Markdown',
  sql: 'SQL',
  go: 'Go',
  ini: 'INI',
  text: '纯文本',
}

export function languageLabel(lang: EditorLanguage): string {
  return LABELS[lang]
}
