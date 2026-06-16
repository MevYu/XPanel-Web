import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { TwoFactorRequired, useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Logo } from '../components/Logo'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [needTotp, setNeedTotp] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username, password, needTotp ? totp : undefined)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof TwoFactorRequired) {
        // 启用 2FA:首次展开验证码输入;已展开则说明码错,提示重输。
        if (needTotp) setError('验证码不正确')
        setNeedTotp(true)
        setTotp('')
      } else {
        // 不泄露细节:无论是用户名错、密码错还是账号不存在,都给同一文案。
        setError('用户名或密码不正确')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden bg-bg p-6">
      {/* 极轻品牌径向光晕,呼应遥测仪表台的暗色基调;reduced-motion 下保持静态。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 left-1/2 h-[60rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--color-brand-soft),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-[28rem] w-[44rem] -translate-x-1/2 translate-y-1/3 rounded-full bg-[radial-gradient(circle,rgba(63,181,127,0.06),transparent_65%)]"
      />
      <Card className="relative z-10 w-full max-w-sm border-surface-2/70 bg-surface/80 p-7 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Logo size={52} />
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-text">
            XPanel
          </h1>
          <p className="text-sm text-muted">登录以进入控制台</p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            label="用户名"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Input
            label="密码"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {needTotp && (
            <Input
              label="两步验证码"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              placeholder="6 位动态码"
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          )}
          {/* 错误文案固定占位淡入:始终保留行高,文案出现/消失都不挤动表单,杜绝闪烁。 */}
          <p
            role="alert"
            aria-live="assertive"
            className="min-h-5 text-sm leading-5 text-crit motion-safe:[animation:var(--animate-error-in)]"
            key={error}
          >
            {error}
          </p>
          <Button
            type="submit"
            disabled={submitting || (needTotp && totp.length !== 6)}
            className="mt-1 w-full"
          >
            {submitting ? '登录中…' : needTotp ? '验证' : '登录'}
          </Button>
        </form>
      </Card>
    </main>
  )
}
