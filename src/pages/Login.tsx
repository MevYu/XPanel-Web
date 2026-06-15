import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { TwoFactorRequired, useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Input } from '../components/Input'

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
      {/* 极轻品牌径向光晕,呼应遥测仪表台的暗色基调。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 left-1/2 h-[60rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--color-brand-soft),transparent_60%)]"
      />
      <Card className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="h-2.5 w-2.5 rounded-full bg-online" aria-hidden />
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
          {error && (
            <span role="alert" className="text-sm text-crit">
              {error}
            </span>
          )}
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
