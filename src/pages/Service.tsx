import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'

// 与后端同款单元名校验,前端先挡掉非法输入避免无谓请求。
const UNIT_RE = /^[a-zA-Z0-9._@-]{1,128}$/

type Verb = 'start' | 'stop' | 'restart'

interface ServiceItem {
  name: string
  description: string
  active: string // running / failed / dead / exited 等 systemd ActiveState
  sub: string
  enabled: boolean
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function statusBadge(active: string) {
  if (active === 'running') return <Badge status="online">运行中</Badge>
  if (active === 'failed') return <Badge status="crit">失败</Badge>
  return <Badge status="neutral">{active || '未知'}</Badge>
}

/** Service 服务管理:列出 systemd 单元供选择,按行执行 start/stop/restart/查状态(写操作需 operator)。 */
export default function Service() {
  const { role } = useAuth()
  const readonly = role === 'readonly'

  const [services, setServices] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [busyUnit, setBusyUnit] = useState<string | null>(null)
  const [output, setOutput] = useState<{ unit: string; text: string } | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      const data = await apiFetch<ServiceItem[]>('/api/m/service/services')
      setServices(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return services
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    )
  }, [services, query])

  async function queryStatus(unit: string) {
    setBusyUnit(unit)
    setFeedback(null)
    try {
      const text = await apiFetch<string>(
        `/api/m/service/status?unit=${encodeURIComponent(unit)}`,
      )
      setOutput({ unit, text: typeof text === 'string' ? text : JSON.stringify(text, null, 2) })
    } catch (e) {
      setOutput(null)
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusyUnit(null)
    }
  }

  async function act(unit: string, verb: Verb) {
    if (readonly) return
    setBusyUnit(unit)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/service/${verb}?unit=${encodeURIComponent(unit)}`, {
        method: 'POST',
      })
      setFeedback({ kind: 'ok', text: `已对 ${unit} 执行 ${verb}` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusyUnit(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text">服务列表</h2>
          <div className="flex items-end gap-2">
            <Input
              label="搜索"
              className="w-56"
              placeholder="按服务名或描述过滤"
              value={query}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              刷新
            </Button>
          </div>
        </div>

        {readonly && (
          <p className="text-xs text-muted">当前角色为只读,写操作需要 operator 角色。</p>
        )}

        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}

        <div className="rounded-(--radius-card) border border-border">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner size={24} />
            </div>
          ) : loadErr ? (
            <p className="p-4 text-sm text-crit">{loadErr}</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              {services.length === 0 ? '暂无服务' : '没有匹配的服务'}
            </p>
          ) : (
            <div className="max-h-[28rem] divide-y divide-border overflow-auto">
              {filtered.map((s) => {
                const busy = busyUnit === s.name
                return (
                  <div
                    key={s.name}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-[family-name:var(--font-mono)] text-sm text-text">
                          {s.name}
                        </span>
                        {statusBadge(s.active)}
                        <span className="text-xs text-muted">
                          {s.enabled ? '开机自启' : '未自启'}
                        </span>
                      </div>
                      {s.description && (
                        <p className="mt-0.5 truncate text-xs text-muted">{s.description}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {busy && <Spinner size={16} />}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void queryStatus(s.name)}
                        disabled={busy}
                      >
                        查状态
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void act(s.name, 'start')}
                        disabled={busy || readonly}
                        title={readonly ? '需要 operator 角色' : undefined}
                      >
                        启动
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void act(s.name, 'restart')}
                        disabled={busy || readonly}
                        title={readonly ? '需要 operator 角色' : undefined}
                      >
                        重启
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void act(s.name, 'stop')}
                        disabled={busy || readonly}
                        title={readonly ? '需要 operator 角色' : undefined}
                      >
                        停止
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      {output !== null && (
        <Card className="flex flex-col gap-2 p-0">
          <div className="flex items-center justify-between px-4 pt-4">
            <h3 className="font-[family-name:var(--font-mono)] text-sm text-text">{output.unit}</h3>
            <Button size="sm" variant="ghost" onClick={() => setOutput(null)}>
              关闭
            </Button>
          </div>
          <pre className="m-4 mt-0 max-h-96 overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
            {output.text}
          </pre>
        </Card>
      )}

      <ManualPanel readonly={readonly} onActed={() => void load()} />
    </div>
  )
}

/** ManualPanel 按名手动管理:列表外的次要入口,默认折叠。 */
function ManualPanel({ readonly, onActed }: { readonly: boolean; onActed: () => void }) {
  const [open, setOpen] = useState(false)
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
      onActed()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between text-left text-sm font-medium text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <span>按名手动管理</span>
        <span className="text-xs text-muted">{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <>
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

          {feedback && (
            <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
              {feedback.text}
            </p>
          )}

          {output !== null && (
            <pre className="max-h-96 overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
              {output}
            </pre>
          )}
        </>
      )}
    </Card>
  )
}
