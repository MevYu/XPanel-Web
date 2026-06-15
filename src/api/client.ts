import type { Tokens } from './types'

const KEY = 'xpanel.tokens'

export const tokenStore = {
  get(): Tokens | null {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as Tokens
    } catch {
      // 被篡改的存储:清掉并视为未登录,而不是让整个 app 崩。
      localStorage.removeItem(KEY)
      return null
    }
  },
  set(t: Tokens) { localStorage.setItem(KEY, JSON.stringify(t)) },
  clear() { localStorage.removeItem(KEY) },
}

// 失效路径清本地 token 后回调,让 AuthContext 同步 React 态触发自动跳登录。
let onAuthCleared: (() => void) | null = null
export function setOnAuthCleared(fn: (() => void) | null) { onAuthCleared = fn }

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg) }
}

// 单飞:并发 401 共享同一个刷新 promise,避免旋转的 refresh token 被多次使用而失效。
let refreshing: Promise<boolean> | null = null

function refresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => { refreshing = null })
  }
  return refreshing
}

async function doRefresh(): Promise<boolean> {
  const t = tokenStore.get()
  if (!t) return false
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: t.refresh }),
  })
  if (!res.ok) { tokenStore.clear(); onAuthCleared?.(); return false }
  tokenStore.set(await res.json())
  return true
}

// apiFetch 注入 Bearer,401 时刷新一次并重试;刷新失败抛错并清 token。
export async function apiFetch<T = unknown>(
  path: string, init: RequestInit = {}, _retried = false,
): Promise<T> {
  const t = tokenStore.get()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (t) headers.Authorization = `Bearer ${t.access}`

  const res = await fetch(path, { ...init, headers })
  if (res.status === 401 && !_retried) {
    if (await refresh()) return apiFetch<T>(path, init, true)
    throw new HttpError(401, 'unauthorized')
  }
  if (!res.ok) throw new HttpError(res.status, await res.text())
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}
