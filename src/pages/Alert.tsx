import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function fmtTime(unix: number | null): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

const METRICS = [
  { value: 'cpu', label: 'CPU 使用率 %' },
  { value: 'memory', label: '内存使用率 %' },
  { value: 'disk', label: '磁盘使用率 %' },
  { value: 'load', label: '系统负载 (1m)' },
  { value: 'disk_io', label: '磁盘 IO B/s' },
] as const
type Metric = (typeof METRICS)[number]['value']

const COMPARATORS = [
  { value: 'gt', label: '大于 (>)' },
  { value: 'lt', label: '小于 (<)' },
] as const
type Comparator = (typeof COMPARATORS)[number]['value']

const KINDS = [
  { value: 'email', label: '邮件 (email)' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'telegram', label: 'Telegram' },
] as const
type Kind = (typeof KINDS)[number]['value']

interface Rule {
  id: number
  name: string
  metric: string
  comparator: string
  threshold: number
  duration_sec: number
  channel_id: number
  enabled: boolean
  created_at: number
  updated_at: number
}

interface Channel {
  id: number
  name: string
  kind: string
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_from: string
  smtp_to: string
  webhook_url: string
  telegram_chat_id: string
  has_secret: boolean
  created_at: number
  updated_at: number
}

interface History {
  id: number
  rule_id: number
  rule_name: string
  metric: string
  value: number
  threshold: number
  notified: boolean
  detail: string
  fired_at: number
}

interface RuleForm {
  id: number | null
  name: string
  metric: Metric
  comparator: Comparator
  threshold: string
  duration_sec: string
  channel_id: string
  enabled: boolean
}

const emptyRule: RuleForm = {
  id: null,
  name: '',
  metric: 'cpu',
  comparator: 'gt',
  threshold: '80',
  duration_sec: '60',
  channel_id: '',
  enabled: true,
}

interface ChannelForm {
  id: number | null
  name: string
  kind: Kind
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_from: string
  smtp_to: string
  webhook_url: string
  telegram_chat_id: string
  secret: string
}

const emptyChannel: ChannelForm = {
  id: null,
  name: '',
  kind: 'email',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_from: '',
  smtp_to: '',
  webhook_url: '',
  telegram_chat_id: '',
  secret: '',
}

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

function metricLabel(m: string): string {
  return METRICS.find((x) => x.value === m)?.label ?? m
}

/** 监控告警:告警规则(operator+)、通知渠道(admin,凭证只写,可测试发送)、告警历史、评估设置。 */
export default function Alert() {
  const { role } = useAuth()
  const canWriteRule = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'

  const [rules, setRules] = useState<Rule[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [settings, setSettings] = useState<{ interval_sec: number; silence_sec: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRule)
  const [chForm, setChForm] = useState<ChannelForm>(emptyChannel)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [r, c, h, s] = await Promise.all([
        apiFetch<Rule[]>('/api/m/alert/rules'),
        apiFetch<Channel[]>('/api/m/alert/channels'),
        apiFetch<History[]>('/api/m/alert/history'),
        apiFetch<{ interval_sec: number; silence_sec: number }>('/api/m/alert/settings'),
      ])
      setRules(r)
      setChannels(c)
      setHistory(h)
      setSettings(s)
      setRuleForm((f) => (f.channel_id === '' && c[0] ? { ...f, channel_id: String(c[0].id) } : f))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const channelName = (id: number): string =>
    channels.find((c) => c.id === id)?.name ?? `渠道 #${id}`

  // --- Rules ---
  const thresholdNum = Number(ruleForm.threshold)
  const durationNum = Number(ruleForm.duration_sec)
  const canSubmitRule =
    ruleForm.name.trim().length > 0 &&
    Number.isFinite(thresholdNum) &&
    Number.isInteger(durationNum) &&
    durationNum >= 0 &&
    ruleForm.channel_id !== '' &&
    !busy &&
    canWriteRule

  async function submitRule() {
    if (!canSubmitRule) return
    setBusy(true)
    setFeedback(null)
    try {
      const body = JSON.stringify({
        name: ruleForm.name.trim(),
        metric: ruleForm.metric,
        comparator: ruleForm.comparator,
        threshold: thresholdNum,
        duration_sec: durationNum,
        channel_id: Number(ruleForm.channel_id),
        enabled: ruleForm.enabled,
      })
      if (ruleForm.id === null) {
        await apiFetch('/api/m/alert/rules', { method: 'POST', body })
        setFeedback({ kind: 'ok', text: '规则已创建' })
      } else {
        await apiFetch(`/api/m/alert/rules/${ruleForm.id}`, { method: 'PUT', body })
        setFeedback({ kind: 'ok', text: '规则已更新' })
      }
      setRuleForm({ ...emptyRule, channel_id: ruleForm.channel_id })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function toggleRule(rule: Rule, next: boolean) {
    if (!canWriteRule) return
    setFeedback(null)
    try {
      await apiFetch(`/api/m/alert/rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: rule.name,
          metric: rule.metric,
          comparator: rule.comparator,
          threshold: rule.threshold,
          duration_sec: rule.duration_sec,
          channel_id: rule.channel_id,
          enabled: next,
        }),
      })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function deleteRule(rule: Rule) {
    if (!canWriteRule) return
    if (!window.confirm(`确认删除规则 ${rule.name}?`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/alert/rules/${rule.id}`, { method: 'DELETE' })
      if (ruleForm.id === rule.id) setRuleForm({ ...emptyRule, channel_id: ruleForm.channel_id })
      setFeedback({ kind: 'ok', text: '规则已删除' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function editRule(rule: Rule) {
    setRuleForm({
      id: rule.id,
      name: rule.name,
      metric: (METRICS.some((m) => m.value === rule.metric) ? rule.metric : 'cpu') as Metric,
      comparator: (rule.comparator === 'lt' ? 'lt' : 'gt') as Comparator,
      threshold: String(rule.threshold),
      duration_sec: String(rule.duration_sec),
      channel_id: String(rule.channel_id),
      enabled: rule.enabled,
    })
    setFeedback(null)
  }

  // --- Channels ---
  function channelPayload(): string {
    const base: Record<string, unknown> = { name: chForm.name.trim(), kind: chForm.kind }
    if (chForm.kind === 'email') {
      base.smtp_host = chForm.smtp_host.trim()
      base.smtp_port = Number(chForm.smtp_port) || 0
      base.smtp_user = chForm.smtp_user.trim()
      base.smtp_from = chForm.smtp_from.trim()
      base.smtp_to = chForm.smtp_to.trim()
    } else if (chForm.kind === 'webhook') {
      base.webhook_url = chForm.webhook_url.trim()
    } else {
      base.telegram_chat_id = chForm.telegram_chat_id.trim()
    }
    if (chForm.secret.length > 0) base.secret = chForm.secret
    return JSON.stringify(base)
  }

  const canSubmitChannel = chForm.name.trim().length > 0 && !busy && isAdmin

  async function submitChannel() {
    if (!canSubmitChannel) return
    setBusy(true)
    setFeedback(null)
    try {
      if (chForm.id === null) {
        await apiFetch('/api/m/alert/channels', { method: 'POST', body: channelPayload() })
        setFeedback({ kind: 'ok', text: '渠道已创建' })
      } else {
        await apiFetch(`/api/m/alert/channels/${chForm.id}`, {
          method: 'PUT',
          body: channelPayload(),
        })
        setFeedback({ kind: 'ok', text: '渠道已更新' })
      }
      setChForm(emptyChannel)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function deleteChannel(c: Channel) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除渠道 ${c.name}?引用它的规则将失效。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/alert/channels/${c.id}`, { method: 'DELETE' })
      if (chForm.id === c.id) setChForm(emptyChannel)
      setFeedback({ kind: 'ok', text: '渠道已删除' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function testChannel(c: Channel) {
    if (!isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/alert/channels/${c.id}/test`, { method: 'POST' })
      setFeedback({ kind: 'ok', text: `测试消息已发送至 ${c.name}` })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function editChannel(c: Channel) {
    setChForm({
      id: c.id,
      name: c.name,
      kind: (KINDS.some((k) => k.value === c.kind) ? c.kind : 'email') as Kind,
      smtp_host: c.smtp_host,
      smtp_port: String(c.smtp_port || ''),
      smtp_user: c.smtp_user,
      smtp_from: c.smtp_from,
      smtp_to: c.smtp_to,
      webhook_url: c.webhook_url,
      telegram_chat_id: c.telegram_chat_id,
      secret: '',
    })
    setFeedback(null)
  }

  async function saveSettings() {
    if (!settings || busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<{ interval_sec: number; silence_sec: number }>(
        '/api/m/alert/settings',
        { method: 'PUT', body: JSON.stringify(settings) },
      )
      setSettings(res)
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const secretLabel =
    chForm.kind === 'email'
      ? 'SMTP 密码(只写)'
      : chForm.kind === 'webhook'
        ? 'Bearer token(只写,可选)'
        : 'Bot token(只写)'

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">
          {ruleForm.id === null ? '新增告警规则' : `编辑规则 #${ruleForm.id}`}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="规则名称"
            value={ruleForm.name}
            onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">指标</span>
            <select
              value={ruleForm.metric}
              onChange={(e) => setRuleForm((f) => ({ ...f, metric: e.target.value as Metric }))}
              className={fieldClass}
            >
              {METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">比较</span>
            <select
              value={ruleForm.comparator}
              onChange={(e) => setRuleForm((f) => ({ ...f, comparator: e.target.value as Comparator }))}
              className={fieldClass}
            >
              {COMPARATORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="阈值"
            inputMode="decimal"
            value={ruleForm.threshold}
            onChange={(e) => setRuleForm((f) => ({ ...f, threshold: e.target.value }))}
          />
          <Input
            label="持续时间(秒)"
            inputMode="numeric"
            value={ruleForm.duration_sec}
            onChange={(e) => setRuleForm((f) => ({ ...f, duration_sec: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">通知渠道</span>
            <select
              value={ruleForm.channel_id}
              onChange={(e) => setRuleForm((f) => ({ ...f, channel_id: e.target.value }))}
              className={fieldClass}
            >
              <option value="">选择渠道…</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <Switch
              checked={ruleForm.enabled}
              onChange={(next) => setRuleForm((f) => ({ ...f, enabled: next }))}
              disabled={!canWriteRule}
              aria-label="启用规则"
            />
            <span className="text-sm text-muted">启用</span>
          </label>
          <Button onClick={() => void submitRule()} disabled={!canSubmitRule}>
            {ruleForm.id === null ? '创建规则' : '保存'}
          </Button>
          {ruleForm.id !== null && (
            <Button
              variant="ghost"
              onClick={() => setRuleForm({ ...emptyRule, channel_id: ruleForm.channel_id })}
              disabled={busy}
            >
              取消
            </Button>
          )}
          {busy && <Spinner size={16} />}
        </div>
        {channels.length === 0 && (
          <p className="text-xs text-warn">尚无通知渠道,请先在下方创建渠道。</p>
        )}
        {!canWriteRule && <p className="text-xs text-muted">规则写操作需要 operator 或 admin 角色。</p>}
        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}
      </Card>

      <Card className="p-0">
        <div className="px-5 py-3">
          <span className="text-sm font-medium text-text">告警规则</span>
        </div>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && rules.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">{loadErr}</p>
        ) : rules.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">暂无告警规则。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-medium text-text">{rule.name}</span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>
                      {metricLabel(rule.metric)} {rule.comparator === 'lt' ? '<' : '>'} {rule.threshold}
                    </span>
                    <span>持续 {rule.duration_sec}s</span>
                    <span>→ {channelName(rule.channel_id)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Switch
                    checked={rule.enabled}
                    onChange={(next) => void toggleRule(rule, next)}
                    disabled={!canWriteRule}
                    aria-label={`${rule.enabled ? '停用' : '启用'} 规则 ${rule.name}`}
                  />
                  <Button size="sm" variant="ghost" onClick={() => editRule(rule)} disabled={!canWriteRule}>
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void deleteRule(rule)}
                    disabled={!canWriteRule}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">
          {chForm.id === null ? '新增通知渠道' : `编辑渠道 #${chForm.id}`}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="渠道名称"
            value={chForm.name}
            onChange={(e) => setChForm((f) => ({ ...f, name: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">类型</span>
            <select
              value={chForm.kind}
              onChange={(e) => setChForm((f) => ({ ...f, kind: e.target.value as Kind }))}
              className={fieldClass}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {chForm.kind === 'email' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="SMTP 主机"
              spellCheck={false}
              value={chForm.smtp_host}
              onChange={(e) => setChForm((f) => ({ ...f, smtp_host: e.target.value }))}
            />
            <Input
              label="SMTP 端口"
              inputMode="numeric"
              value={chForm.smtp_port}
              onChange={(e) => setChForm((f) => ({ ...f, smtp_port: e.target.value }))}
            />
            <Input
              label="SMTP 用户名(可选)"
              spellCheck={false}
              value={chForm.smtp_user}
              onChange={(e) => setChForm((f) => ({ ...f, smtp_user: e.target.value }))}
            />
            <Input
              label="发件地址 (from)"
              spellCheck={false}
              value={chForm.smtp_from}
              onChange={(e) => setChForm((f) => ({ ...f, smtp_from: e.target.value }))}
            />
            <Input
              label="收件地址(逗号分隔)"
              spellCheck={false}
              className="sm:col-span-2"
              value={chForm.smtp_to}
              onChange={(e) => setChForm((f) => ({ ...f, smtp_to: e.target.value }))}
            />
          </div>
        )}
        {chForm.kind === 'webhook' && (
          <Input
            label="Webhook URL"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-[family-name:var(--font-mono)]"
            value={chForm.webhook_url}
            onChange={(e) => setChForm((f) => ({ ...f, webhook_url: e.target.value }))}
          />
        )}
        {chForm.kind === 'telegram' && (
          <Input
            label="Telegram chat id"
            spellCheck={false}
            value={chForm.telegram_chat_id}
            onChange={(e) => setChForm((f) => ({ ...f, telegram_chat_id: e.target.value }))}
          />
        )}
        <Input
          label={`${secretLabel}${chForm.id !== null ? ' · 留空保持不变' : ''}`}
          type="password"
          autoComplete="off"
          value={chForm.secret}
          onChange={(e) => setChForm((f) => ({ ...f, secret: e.target.value }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void submitChannel()} disabled={!canSubmitChannel}>
            {chForm.id === null ? '创建渠道' : '保存'}
          </Button>
          {chForm.id !== null && (
            <Button variant="ghost" onClick={() => setChForm(emptyChannel)} disabled={busy}>
              取消
            </Button>
          )}
        </div>
        {!isAdmin && <p className="text-xs text-muted">通知渠道操作需要 admin 角色。</p>}

        {channels.length > 0 && (
          <div className="divide-y divide-border rounded-(--radius-card) border border-border">
            {channels.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-4 py-2.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm font-medium text-text">{c.name}</span>
                  <Badge status="neutral">{c.kind}</Badge>
                  {c.has_secret && <Badge status="online">凭证已配置</Badge>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => void testChannel(c)} disabled={!isAdmin}>
                    测试发送
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => editChannel(c)} disabled={!isAdmin}>
                    编辑
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void deleteChannel(c)} disabled={!isAdmin}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">告警历史</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
        </div>
        {history.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">暂无告警记录。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{h.rule_name}</span>
                    <Badge status={h.notified ? 'online' : 'warn'}>
                      {h.notified ? '已通知' : '未通知'}
                    </Badge>
                  </div>
                  <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                    {h.detail}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted">{fmtTime(h.fired_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {settings && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">评估设置</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="评估间隔(秒,5–3600)"
              inputMode="numeric"
              value={String(settings.interval_sec)}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, interval_sec: Number(e.target.value) || 0 } : s))
              }
            />
            <Input
              label="静默时长(秒,0–86400)"
              inputMode="numeric"
              value={String(settings.silence_sec)}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, silence_sec: Number(e.target.value) || 0 } : s))
              }
            />
          </div>
          <div>
            <Button onClick={() => void saveSettings()} disabled={busy || !isAdmin}>
              保存设置
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
