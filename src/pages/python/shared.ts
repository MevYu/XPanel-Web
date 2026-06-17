// Python 项目模块共享:类型、文案、状态推断。后端契约以 internal/modules/python 为准。

export const DANGER = { 'X-Confirm-Danger': '1' }

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

export type StartKind = 'gunicorn' | 'uvicorn' | 'script'

export interface Project {
  id: number
  name: string
  project_dir: string
  venv_dir: string
  interpreter: string
  start_kind: string
  app_target: string
  port: number
  workers: number
  created_by: number | null
  created_at: number
  updated_at: number
}

export interface PySettings {
  project_root: string
  venv_root: string
  interpreter: string
  conf_dir: string
  log_dir: string
}

export const emptySettings: PySettings = {
  project_root: '',
  venv_root: '',
  interpreter: '',
  conf_dir: '',
  log_dir: '',
}

// 启动方式 → 框架/方式中文标注,作为列内"框架"展示。
export const startKindLabel: Record<string, string> = {
  gunicorn: 'gunicorn (WSGI)',
  uvicorn: 'uvicorn (ASGI)',
  script: '脚本',
}

// 进程运行态:从 /status 纯文本推断(supervisor 语义)。
export type RunState = 'unknown' | 'running' | 'stopped'

/** runStateFromStatus 把 supervisor 状态文本归一为运行态:含 RUNNING/STARTING 视为运行中。 */
export function runStateFromStatus(text: string): RunState {
  const t = text.toUpperCase()
  if (!t.trim()) return 'unknown'
  if (t.includes('RUNNING') || t.includes('STARTING')) return 'running'
  return 'stopped'
}

// 字段样式串:裸 select 复用,与站点页保持一致。
export const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40'
