import { useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'

// 与后端同款单元名校验,前端先挡掉非法输入避免无谓请求。
const UNIT_RE = /^[a-zA-Z0-9._@-]{1,128}$/

type Verb = 'start' | 'stop' | 'restart'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

/** Service 服务管理:查询 systemd 单元状态并执行 start/stop/restart(写操作需 operator)。 */
export default function Service() {
  const { role } = useAuth()
  const readonly = role === 'readonly'

  const [unit, setUnit] = useState('')
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const trimmed = unit.trim()
  const invalid = trimmed.length > 0 && !UNIT_RE.test(trimmed)
  const canAct = trimmed.length > 0 && !invalid && !busy

  async function queryStatus() {
    if (!canAct) return
    setBusy(true)
    setFeedback(null)
    try {
      const text = await apiFetch<string>(
        `/api/m/service/status?unit=${encodeURIComponent(trimmed)}`,
      )
      setOutput(typeof text === 'string' ? text : JSON.stringify(text, null, 2))
    } catch (e) {
      setOutput(null)
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function act(verb: Verb) {
    if (!canAct || readonly) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/service/${verb}?unit=${encodeURIComponent(trimmed)}`, {
        method: 'POST',
      })
      setFeedback({ kind: 'ok', text: `已对 ${trimmed} 执行 ${verb}` })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <Input
          label="服务单元"
          placeholder="例如 nginx、ssh"
          value={unit}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          error={invalid ? '单元名仅允许字母、数字与 . _ @ - ,长度 1–128' : undefined}
          onChange={(e) => setUnit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void queryStatus()
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => void queryStatus()} disabled={!canAct}>
            查询状态
          </Button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <Button
            onClick={() => void act('restart')}
            disabled={!canAct || readonly}
            title={readonly ? '需要 operator 角色' : undefined}
          >
            重启
          </Button>
          <Button
            variant="ghost"
            onClick={() => void act('start')}
            disabled={!canAct || readonly}
            title={readonly ? '需要 operator 角色' : undefined}
          >
            启动
          </Button>
          <Button
            variant="danger"
            onClick={() => void act('stop')}
            disabled={!canAct || readonly}
            title={readonly ? '需要 operator 角色' : undefined}
          >
            停止
          </Button>
          {busy && <Spinner size={16} />}
        </div>

        {readonly && (
          <p className="text-xs text-muted">当前角色为只读,写操作需要 operator 角色。</p>
        )}

        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}
      </Card>

      {output !== null && (
        <Card className="p-0">
          <pre className="max-h-96 overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
            {output}
          </pre>
        </Card>
      )}
    </div>
  )
}
