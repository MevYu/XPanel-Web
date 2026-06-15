import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { setOnAuthCleared, tokenStore } from '../api/client'
import { roleFromAccess } from './jwt'
import type { Tokens } from '../api/types'

/** TwoFactorRequired:后端返回 401 + {"code":"2fa_required"} 时由 login 抛出,
 * 让登录页区分"需要 TOTP"与真正的"密码错误"。 */
export class TwoFactorRequired extends Error {
  constructor() {
    super('2fa_required')
    this.name = 'TwoFactorRequired'
  }
}

interface AuthState {
  isAuthed: boolean
  /** 从 access JWT payload 解出的角色,仅用于 UI 角色门;真正鉴权在后端。 */
  role: string
  /** 登录;启用 2FA 的用户首次不带 totp 调用会抛 TwoFactorRequired,带 totp 重试即可。 */
  login(username: string, password: string, totp?: string): Promise<void>
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

  const login = useCallback(async (username: string, password: string, totp?: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, ...(totp ? { totp } : {}) }),
    })
    if (!res.ok) {
      // 区分两种 401:启用 2FA 但未给/给错码 → body {"code":"2fa_required"};其余按密码错处理。
      if (res.status === 401) {
        const body = await res.text()
        try {
          if ((JSON.parse(body) as { code?: string }).code === '2fa_required') {
            throw new TwoFactorRequired()
          }
        } catch (e) {
          if (e instanceof TwoFactorRequired) throw e
          // 非 JSON(纯文本 "unauthorized"):落到下方通用错误。
        }
      }
      throw new Error('login failed')
    }
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
