import type { Tokens } from './types'

const KEY = 'xpanel.tokens'

export const tokenStore = {
  get(): Tokens | null {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Tokens) : null
  },
  set(t: Tokens) { localStorage.setItem(KEY, JSON.stringify(t)) },
  clear() { localStorage.removeItem(KEY) },
}

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg) }
}

async function refresh(): Promise<boolean> {
  const t = tokenStore.get()
  if (!t) return false
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: t.refresh }),
  })
  if (!res.ok) { tokenStore.clear(); return false }
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
