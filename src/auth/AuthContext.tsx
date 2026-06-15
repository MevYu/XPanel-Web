import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { setOnAuthCleared, tokenStore } from '../api/client'
import { roleFromAccess } from './jwt'
import type { Tokens } from '../api/types'

interface AuthState {
  isAuthed: boolean
  /** 从 access JWT payload 解出的角色,仅用于 UI 角色门;真正鉴权在后端。 */
  role: string
  login(username: string, password: string): Promise<void>
  logout(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<Tokens | null>(() => tokenStore.get())

  // 刷新失败时 client 已清本地 token,这里同步 React 态以触发自动跳登录。
  useEffect(() => {
    setOnAuthCleared(() => setTokens(null))
    return () => setOnAuthCleared(null)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) throw new Error('login failed')
    const t = (await res.json()) as Tokens
    tokenStore.set(t)
    setTokens(t)
  }, [])

  const logout = useCallback(async () => {
    const t = tokenStore.get()
    if (t) {
      // 尽力通知后端撤销 refresh;网络失败也要本地清干净。
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: t.refresh }),
        })
      } catch {
        // 忽略:本地登出不依赖后端可达性。
      }
    }
    tokenStore.clear()
    setTokens(null)
    window.location.assign('/login')
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      isAuthed: tokens !== null,
      role: roleFromAccess(tokens?.access),
      login,
      logout,
    }),
    [tokens, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** useAuth 读取登录态;必须在 AuthProvider 内调用。 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
