import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

type Action = 'allow' | 'deny'
type Proto = 'tcp' | 'udp'

interface RuleForm {
  action: Action
  port: string
  proto: Proto
  source: string
  comment: string
}

const emptyRule: RuleForm = { action: 'allow', port: '', proto: 'tcp', source: '', comment: '' }

// 端口规范:单端口或区间(后端 PortRule.port 为字符串,支持 "8000-9000")。
const PORT_SPEC = /^\d{1,5}(-\d{1,5})?$/

function validPortSpec(spec: string): boolean {
  if (!PORT_SPEC.test(spec)) return false
  const parts = spec.split('-').map(Number)
  return parts.every((n) => n >= 1 && n <= 65535) && (parts.length === 1 || parts[0] <= parts[1])
}

interface PortRule {
  action: string
  port: string
  proto: string
  source: string
  comment: string
}

/** Firewall 防火墙:显示检测到的后端,列出规则,放行/拒绝端口,删除规则与禁用走二次确认。 */
export default function Firewall() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [backend, setBackend] = useState<string>('')
  const [rules, setRules] = useState<PortRule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState<RuleForm>(emptyRule)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [b, r] = await Promise.all([
        apiFetch<{ backend: string }>('/api/m/firewall/backend'),
        apiFetch<PortRule[]>('/api/m/firewall/rules'),
      ])
      setBackend(b.backend)
      setRules(Array.isArray(r) ? r : [])
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const portValid = validPortSpec(form.port.trim())
  const canSubmit = portValid && !busy && isAdmin

  function rulePayload() {
    return JSON.stringify({
      action: form.action,
      port: form.port.trim(),
      proto: form.proto,
      source: form.source.trim(),
      comment: form.comment.trim(),
    })
  }

  async function addRule() {
    if (!canSubmit) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/firewall/rules', { method: 'POST', body: rulePayload() })
      setFeedback({ kind: 'ok', text: '规则已添加' })
      setForm(emptyRule)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function delRule() {
    if (!canSubmit) return
    if (!window.confirm(`确认删除规则 ${form.action} ${form.proto}/${form.port}?此操作危险。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/firewall/rules', {
        method: 'DELETE',
        headers: DANGER,
        body: rulePayload(),
      })
      setFeedback({ kind: 'ok', text: '规则已删除' })
      setForm(emptyRule)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function setEnabled(enable: boolean) {
    if (!isAdmin || busy) return
    if (!enable && !window.confirm('确认禁用防火墙?这将清除当前保护,此操作危险。')) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/firewall/${enable ? 'enable' : 'disable'}`, {
        method: 'POST',
        headers: enable ? undefined : DANGER,
      })
      setFeedback({ kind: 'ok', text: enable ? '防火墙已启用' : '防火墙已禁用' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">检测到的后端</span>
          {backend ? (
            <Badge status="online">{backend}</Badge>
          ) : (
            <Badge status="neutral">未知</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {busy && <Spinner size={16} />}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void setEnabled(true)}
            disabled={!isAdmin || busy}
            title={isAdmin ? undefined : '需要 admin 角色'}
          >
            启用防火墙
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void setEnabled(false)}
            disabled={!isAdmin || busy}
            title={isAdmin ? undefined : '需要 admin 角色'}
          >
            禁用防火墙
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">端口规则</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">动作</span>
            <select
              value={form.action}
              onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as Action }))}
              className="h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <option value="allow">放行 allow</option>
              <option value="deny">拒绝 deny</option>
            </select>
          </label>
          <Input
            label="端口"
            placeholder="80 或 8000-9000"
            value={form.port}
            error={form.port.length > 0 && !portValid ? '端口需为 1–65535,或区间如 8000-9000' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">协议</span>
            <select
              value={form.proto}
              onChange={(e) => setForm((f) => ({ ...f, proto: e.target.value as Proto }))}
              className="h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
            </select>
          </label>
          <Input
            label="来源 IP/CIDR"
            placeholder="留空为任意"
            spellCheck={false}
            value={form.source}
            onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
          />
          <Input
            label="备注(可选)"
            placeholder="备注"
            spellCheck={false}
            value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void addRule()} disabled={!canSubmit}>
            添加规则
          </Button>
          <Button variant="danger" onClick={() => void delRule()} disabled={!canSubmit}>
            删除规则
          </Button>
        </div>
        {!isAdmin && <p className="text-xs text-muted">规则与启停操作需要 admin 角色。</p>}
        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">当前规则</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr ? (
          <p className="px-5 pb-4 text-sm text-muted">{loadErr}</p>
        ) : rules.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">无规则</p>
        ) : (
          <div className="max-h-96 divide-y divide-border overflow-auto border-t border-border">
            {rules.map((rule, i) => (
              <div key={`${rule.action}-${rule.proto}-${rule.port}-${rule.source}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Badge status={rule.action === 'allow' ? 'online' : 'crit'}>{rule.action}</Badge>
                  <span className="font-[family-name:var(--font-mono)] text-sm text-text">{rule.proto}/{rule.port}</span>
                  {rule.source && <span className="truncate text-xs text-muted">来源 {rule.source}</span>}
                </div>
                {rule.comment && <span className="truncate text-xs text-muted">{rule.comment}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
