import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Switch } from '../components/Switch'
import { Spinner } from '../components/Spinner'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Tabs } from '../components/Tabs'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { Plus, BellRing, History, SlidersHorizontal, SendHorizontal, Radio } from 'lucide-react'
import { formatTime } from '../lib/formatTime'

// alert 删除端点后端不强制 X-Confirm-Danger,这里仍随危险删除惯例带上,保持各页一致。
const DANGER = { 'X-Confirm-Danger': '1' }

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function fmtTime(unix: number | null): string {
  return formatTime(unix ?? 0)
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
  { value: 'dingtalk', label: '钉钉' },
  { value: 'wecom', label: '企业微信' },
  { value: 'feishu', label: '飞书' },
] as const
type Kind = (typeof KINDS)[number]['value']

const KIND_LABEL: Record<string, string> = {
  email: '邮件',
  webhook: 'Webhook',
  telegram: 'Telegram',
  dingtalk: '钉钉',
  wecom: '企业微信',
  feishu: '飞书',
}

// 钉钉/企微/飞书:均为「机器人 Webhook 地址」一栏(复用 webhook_url 字段)。
const WEBHOOK_URL_KINDS = ['webhook', 'dingtalk', 'wecom', 'feishu']
const URL_LABEL: Record<string, string> = {
  webhook: 'Webhook URL',
  dingtalk: '钉钉机器人 Webhook 地址',
  wecom: '企业微信机器人 Webhook 地址',
  feishu: '飞书机器人 Webhook 地址',
}

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

interface AlertHistory {
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

interface Settings {
  interval_sec: number
  silence_sec: number
}

const selectClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

function metricLabel(m: string): string {
  return METRICS.find((x) => x.value === m)?.label ?? m
}

type Tab = 'rules' | 'channels' | 'history'

const TABS: { key: Tab; label: string }[] = [
  { key: 'rules', label: '告警规则' },
  { key: 'channels', label: '通知渠道' },
  { key: 'history', label: '告警历史' },
]

/** 监控告警:告警规则(operator+)、通知渠道(admin,凭证只写,可测试发送)、告警历史、评估设置;aaPanel 风格顶部 tab + 紧凑表 + 固定弹窗。 */
export default function Alert() {
  const { role } = useAuth()
  const canWriteRule = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'

  const [tab, setTab] = useState<Tab>('rules')

  const [rules, setRules] = useState<Rule[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [editingRule, setEditingRule] = useState<Rule | 'new' | null>(null)
  const [editingChannel, setEditingChannel] = useState<Channel | 'new' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 渠道页 test/delete 的就地反馈与忙碌行(原 ChannelsModal 内部状态上提)。
  const [channelBusyId, setChannelBusyId] = useState<number | null>(null)
  const [channelFeedback, setChannelFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // 告警历史按需加载:首次进入 history tab 时拉取(原 HistoryModal 的 onMount 逻辑)。
  const [history, setHistory] = useState<AlertHistory[] | null>(null)
  const [historyErr, setHistoryErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [r, c, s] = await Promise.all([
        apiFetch<Rule[]>('/api/m/alert/rules'),
        apiFetch<Channel[]>('/api/m/alert/channels'),
        apiFetch<Settings>('/api/m/alert/settings'),
      ])
      setRules(r)
      setChannels(c)
      setSettings(s)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const loadHistory = useCallback(async () => {
    setHistoryErr(null)
    setHistory(null)
    try {
      setHistory(await apiFetch<AlertHistory[]>('/api/m/alert/history'))
    } catch (e) {
      setHistoryErr(errorText(e))
    }
  }, [])

  useEffect(() => {
    if (tab === 'history' && history === null && historyErr === null) void loadHistory()
  }, [tab, history, historyErr, loadHistory])

  const channelName = useCallback(
    (id: number): string => channels.find((c) => c.id === id)?.name ?? `渠道 #${id}`,
    [channels],
  )

  async function toggleRule(rule: Rule, next: boolean) {
    if (!canWriteRule) return
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
      setLoadErr(errorText(e))
    }
  }

  async function deleteRule(rule: Rule) {
    if (!canWriteRule) return
    if (!window.confirm(`确认删除规则「${rule.name}」?此操作不可恢复。`)) return
    try {
      await apiFetch(`/api/m/alert/rules/${rule.id}`, { method: 'DELETE', headers: DANGER })
      await load()
    } catch (e) {
      setLoadErr(errorText(e))
    }
  }

  async function testChannel(c: Channel) {
    if (!isAdmin) return
    setChannelBusyId(c.id)
    setChannelFeedback(null)
    try {
      await apiFetch(`/api/m/alert/channels/${c.id}/test`, { method: 'POST' })
      setChannelFeedback({ kind: 'ok', text: `测试消息已发送至 ${c.name}` })
    } catch (e) {
      setChannelFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setChannelBusyId(null)
    }
  }

  async function removeChannel(c: Channel) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除渠道「${c.name}」?引用它的规则将失效。`)) return
    setChannelBusyId(c.id)
    setChannelFeedback(null)
    try {
      await apiFetch(`/api/m/alert/channels/${c.id}`, { method: 'DELETE', headers: DANGER })
      setChannelFeedback({ kind: 'ok', text: '渠道已删除' })
      await load()
    } catch (e) {
      setChannelFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setChannelBusyId(null)
    }
  }

  const ruleColumns: Column<Rule>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '规则名',
        cell: (rule) => (
          <div className="flex min-w-0 items-center gap-2">
            <BellRing size={15} className="shrink-0 text-warn" />
            <span className="truncate font-medium text-text">{rule.name}</span>
          </div>
        ),
      },
      {
        key: 'metric',
        header: '监控指标',
        width: '150px',
        cell: (rule) => <span className="text-muted">{metricLabel(rule.metric)}</span>,
      },
      {
        key: 'threshold',
        header: '阈值',
        width: '150px',
        cell: (rule) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
            {rule.comparator === 'lt' ? '<' : '>'} {rule.threshold}
            <span className="text-text/60"> · {rule.duration_sec}s</span>
          </span>
        ),
      },
      {
        key: 'channel',
        header: '通知渠道',
        width: '160px',
        cell: (rule) => <span className="truncate text-muted">{channelName(rule.channel_id)}</span>,
      },
      {
        key: 'status',
        header: '状态',
        width: '64px',
        cell: (rule) => (
          <Switch
            checked={rule.enabled}
            onChange={(next) => void toggleRule(rule, next)}
            disabled={!canWriteRule}
            aria-label={`${rule.enabled ? '停用' : '启用'} 规则 ${rule.name}`}
          />
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '120px',
        align: 'right',
        cell: (rule) => (
          <ActionLinks>
            <ActionLink disabled={!canWriteRule} onClick={() => setEditingRule(rule)}>
              编辑
            </ActionLink>
            <ActionLink
              danger
              disabled={!canWriteRule}
              aria-label="删除规则"
              title={canWriteRule ? '删除规则' : '需要 operator 或 admin 角色'}
              onClick={() => void deleteRule(rule)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [canWriteRule, channelName],
  )

  const channelColumns: Column<Channel>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '渠道名',
        cell: (c) => (
          <div className="flex min-w-0 items-center gap-2">
            <SendHorizontal size={15} className="shrink-0 text-warn" />
            <span className="truncate font-medium text-text">{c.name}</span>
          </div>
        ),
      },
      {
        key: 'kind',
        header: '类型',
        width: '96px',
        cell: (c) => <span className="text-muted">{KIND_LABEL[c.kind] ?? c.kind}</span>,
      },
      {
        key: 'secret',
        header: '凭证',
        width: '110px',
        cell: (c) =>
          c.has_secret ? <Badge status="online">已配置</Badge> : <Badge status="neutral">未配置</Badge>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '170px',
        align: 'right',
        cell: (c) => (
          <ActionLinks>
            <ActionLink disabled={!isAdmin || channelBusyId === c.id} onClick={() => void testChannel(c)}>
              {channelBusyId === c.id ? '处理中' : '测试'}
            </ActionLink>
            <ActionLink disabled={!isAdmin} onClick={() => setEditingChannel(c)}>
              编辑
            </ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin}
              aria-label="删除渠道"
              title={isAdmin ? '删除渠道' : '需要 admin 角色'}
              onClick={() => void removeChannel(c)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, channelBusyId],
  )

  const historyColumns: Column<AlertHistory>[] = useMemo(
    () => [
      {
        key: 'rule',
        header: '规则',
        cell: (h) => <span className="truncate font-medium text-text">{h.rule_name}</span>,
      },
      {
        key: 'metric',
        header: '触发条件',
        width: '220px',
        cell: (h) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
            {metricLabel(h.metric)} · 实测 {h.value} / 阈值 {h.threshold}
          </span>
        ),
      },
      {
        key: 'notified',
        header: '通知',
        width: '90px',
        cell: (h) => (
          <Badge status={h.notified ? 'online' : 'warn'}>{h.notified ? '已通知' : '未通知'}</Badge>
        ),
      },
      {
        key: 'fired',
        header: '触发时间',
        width: '180px',
        align: 'right',
        cell: (h) => <span className="text-xs text-muted">{fmtTime(h.fired_at)}</span>,
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'rules' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="md" disabled={!canWriteRule} onClick={() => setEditingRule('new')}>
                <Plus size={15} />
                添加规则
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="md" onClick={() => void load()} disabled={loading}>
                刷新
              </Button>
              <Button variant="ghost" size="md" onClick={() => setSettingsOpen(true)}>
                <SlidersHorizontal size={15} />
                评估设置
              </Button>
            </div>
          </div>

          {loadErr && rules.length === 0 && !loading && (
            <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
              {loadErr}
              <Button size="sm" variant="ghost" onClick={() => void load()}>
                重试
              </Button>
            </p>
          )}

          {loading ? (
            <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
          ) : (
            <Table
              columns={ruleColumns}
              rows={rules}
              rowKey={(rule) => rule.id}
              emptyText={
                <EmptyState
                  icon={<BellRing />}
                  title="还没有告警规则"
                  hint={
                    channels.length === 0
                      ? '先在「通知渠道」创建一个渠道,再「添加规则」。'
                      : '点击「添加规则」创建你的第一条告警规则。'
                  }
                />
              }
            />
          )}

          {!canWriteRule && (
            <p className="text-xs text-muted">
              规则写操作需要 operator 或 admin 角色,渠道与设置需要 admin。
            </p>
          )}
        </>
      )}

      {tab === 'channels' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="md" disabled={!isAdmin} onClick={() => setEditingChannel('new')}>
                <Plus size={15} />
                新增渠道
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="md" onClick={() => void load()} disabled={loading}>
                刷新
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted">凭证只写不回显;新建后可「测试」验证可达性。</p>

          {channelFeedback && (
            <p
              className={`rounded-(--radius-card) border px-3 py-2 text-sm ${
                channelFeedback.kind === 'ok'
                  ? 'border-online/40 bg-online/10 text-online'
                  : 'border-crit/40 bg-crit/10 text-crit'
              }`}
            >
              {channelFeedback.text}
            </p>
          )}

          {loadErr && channels.length === 0 && !loading && (
            <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
              {loadErr}
              <Button size="sm" variant="ghost" onClick={() => void load()}>
                重试
              </Button>
            </p>
          )}

          {loading ? (
            <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
          ) : (
            <Table
              columns={channelColumns}
              rows={channels}
              rowKey={(c) => c.id}
              emptyText={
                <EmptyState
                  icon={<Radio />}
                  title="还没有通知渠道"
                  hint="点击「新增渠道」配置邮件 / Webhook / Telegram / 钉钉 / 企业微信 / 飞书。"
                />
              }
            />
          )}

          {!isAdmin && <p className="text-xs text-muted">通知渠道操作需要 admin 角色。</p>}
        </>
      )}

      {tab === 'history' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="md" onClick={() => void loadHistory()}>
                <History size={15} />
                刷新
              </Button>
            </div>
          </div>

          {historyErr ? (
            <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
              {historyErr}
              <Button size="sm" variant="ghost" onClick={() => void loadHistory()}>
                重试
              </Button>
            </p>
          ) : history === null ? (
            <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
          ) : (
            <Table
              columns={historyColumns}
              rows={history}
              rowKey={(h) => h.id}
              emptyText={
                <EmptyState
                  icon={<History />}
                  title="暂无告警记录"
                  hint="规则触发后,这里会出现历史记录。"
                />
              }
            />
          )}
        </>
      )}

      {editingRule && (
        <RuleModal
          rule={editingRule === 'new' ? null : editingRule}
          channels={channels}
          canWrite={canWriteRule}
          onClose={() => setEditingRule(null)}
          onSaved={() => {
            setEditingRule(null)
            void load()
          }}
        />
      )}
      {editingChannel && (
        <ChannelEditModal
          channel={editingChannel === 'new' ? null : editingChannel}
          isAdmin={isAdmin}
          onClose={() => setEditingChannel(null)}
          onSaved={() => {
            setEditingChannel(null)
            void load()
          }}
        />
      )}
      {settingsOpen && settings && (
        <SettingsModal
          settings={settings}
          isAdmin={isAdmin}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setSettings(s)
            setSettingsOpen(false)
          }}
        />
      )}
    </div>
  )
}

interface RuleForm {
  name: string
  metric: Metric
  comparator: Comparator
  threshold: string
  duration_sec: string
  channel_id: string
  enabled: boolean
}

function ruleToForm(rule: Rule | null, channels: Channel[]): RuleForm {
  if (!rule) {
    return {
      name: '',
      metric: 'cpu',
      comparator: 'gt',
      threshold: '80',
      duration_sec: '60',
      channel_id: channels[0] ? String(channels[0].id) : '',
      enabled: true,
    }
  }
  return {
    name: rule.name,
    metric: (METRICS.some((m) => m.value === rule.metric) ? rule.metric : 'cpu') as Metric,
    comparator: (rule.comparator === 'lt' ? 'lt' : 'gt') as Comparator,
    threshold: String(rule.threshold),
    duration_sec: String(rule.duration_sec),
    channel_id: String(rule.channel_id),
    enabled: rule.enabled,
  }
}

/** RuleModal 新建/编辑告警规则弹窗:指标 + 比较器 + 阈值 + 持续时间 + 通知渠道,固定尺寸表单。 */
function RuleModal({
  rule,
  channels,
  canWrite,
  onClose,
  onSaved,
}: {
  rule: Rule | null
  channels: Channel[]
  canWrite: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<RuleForm>(() => ruleToForm(rule, channels))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const thresholdNum = Number(form.threshold)
  const durationNum = Number(form.duration_sec)
  const canSubmit =
    canWrite &&
    !busy &&
    form.name.trim().length > 0 &&
    Number.isFinite(thresholdNum) &&
    Number.isInteger(durationNum) &&
    durationNum >= 0 &&
    form.channel_id !== ''

  function set<K extends keyof RuleForm>(key: K, value: RuleForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const body = JSON.stringify({
        name: form.name.trim(),
        metric: form.metric,
        comparator: form.comparator,
        threshold: thresholdNum,
        duration_sec: durationNum,
        channel_id: Number(form.channel_id),
        enabled: form.enabled,
      })
      if (rule === null) {
        await apiFetch('/api/m/alert/rules', { method: 'POST', body })
      } else {
        await apiFetch(`/api/m/alert/rules/${rule.id}`, { method: 'PUT', body })
      }
      onSaved()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={rule === null ? '添加告警规则' : `编辑规则 #${rule.id}`} onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <Input
          label="规则名称"
          placeholder="例如 CPU 持续过高"
          value={form.name}
          autoFocus
          onChange={(e) => set('name', e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">监控指标</span>
            <select
              value={form.metric}
              onChange={(e) => set('metric', e.target.value as Metric)}
              className={selectClass}
            >
              {METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">比较方式</span>
            <select
              value={form.comparator}
              onChange={(e) => set('comparator', e.target.value as Comparator)}
              className={selectClass}
            >
              {COMPARATORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="阈值"
            inputMode="decimal"
            value={form.threshold}
            error={
              form.threshold.length > 0 && !Number.isFinite(thresholdNum) ? '阈值需为数字' : undefined
            }
            onChange={(e) => set('threshold', e.target.value)}
          />
          <Input
            label="持续时间(秒)"
            inputMode="numeric"
            value={form.duration_sec}
            error={
              form.duration_sec.length > 0 && (!Number.isInteger(durationNum) || durationNum < 0)
                ? '需为非负整数'
                : undefined
            }
            onChange={(e) => set('duration_sec', e.target.value)}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">通知渠道</span>
          <select
            value={form.channel_id}
            onChange={(e) => set('channel_id', e.target.value)}
            className={selectClass}
          >
            <option value="">选择渠道…</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {channels.length === 0 && (
            <span className="text-xs text-warn">尚无通知渠道,请先在「通知渠道」创建。</span>
          )}
        </label>

        <label className="flex items-center gap-2">
          <Switch
            checked={form.enabled}
            onChange={(next) => set('enabled', next)}
            disabled={!canWrite}
            aria-label="启用规则"
          />
          <span className="text-sm text-text">启用</span>
        </label>

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            {rule === null ? '创建规则' : '保存'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

interface ChannelFormState {
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

function channelToForm(c: Channel | null): ChannelFormState {
  if (!c) {
    return {
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
  }
  return {
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
  }
}

/** ChannelEditModal 新建/编辑通知渠道弹窗:类型切换展开对应字段,密钥只写(留空保持不变)。 */
function ChannelEditModal({
  channel,
  isAdmin,
  onClose,
  onSaved,
}: {
  channel: Channel | null
  isAdmin: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ChannelFormState>(() => channelToForm(channel))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const canSubmit = isAdmin && !busy && form.name.trim().length > 0

  function set<K extends keyof ChannelFormState>(key: K, value: ChannelFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function payload(): string {
    const base: Record<string, unknown> = { name: form.name.trim(), kind: form.kind }
    if (form.kind === 'email') {
      base.smtp_host = form.smtp_host.trim()
      base.smtp_port = Number(form.smtp_port) || 0
      base.smtp_user = form.smtp_user.trim()
      base.smtp_from = form.smtp_from.trim()
      base.smtp_to = form.smtp_to.trim()
    } else if (WEBHOOK_URL_KINDS.includes(form.kind)) {
      base.webhook_url = form.webhook_url.trim()
    } else {
      base.telegram_chat_id = form.telegram_chat_id.trim()
    }
    if (form.secret.length > 0) base.secret = form.secret
    return JSON.stringify(base)
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      if (channel === null) {
        await apiFetch('/api/m/alert/channels', { method: 'POST', body: payload() })
      } else {
        await apiFetch(`/api/m/alert/channels/${channel.id}`, { method: 'PUT', body: payload() })
      }
      onSaved()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const secretLabel =
    form.kind === 'email'
      ? 'SMTP 密码(只写)'
      : form.kind === 'webhook'
        ? 'Bearer token(只写,可选)'
        : form.kind === 'telegram'
          ? 'Bot token(只写)'
          : ''
  // 钉钉/企微/飞书:仅需 Webhook 地址,无密钥项。
  const showSecret = secretLabel !== ''

  return (
    <Modal
      title={channel === null ? '新增通知渠道' : `编辑渠道 #${channel.id}`}
      onClose={onClose}
      size="md"
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="渠道名称"
            value={form.name}
            autoFocus
            onChange={(e) => set('name', e.target.value)}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">类型</span>
            <select
              value={form.kind}
              onChange={(e) => set('kind', e.target.value as Kind)}
              className={selectClass}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {form.kind === 'email' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="SMTP 主机"
              spellCheck={false}
              value={form.smtp_host}
              onChange={(e) => set('smtp_host', e.target.value)}
            />
            <Input
              label="SMTP 端口"
              inputMode="numeric"
              value={form.smtp_port}
              onChange={(e) => set('smtp_port', e.target.value)}
            />
            <Input
              label="SMTP 用户名(可选)"
              spellCheck={false}
              value={form.smtp_user}
              onChange={(e) => set('smtp_user', e.target.value)}
            />
            <Input
              label="发件地址 (from)"
              spellCheck={false}
              value={form.smtp_from}
              onChange={(e) => set('smtp_from', e.target.value)}
            />
            <Input
              label="收件地址(逗号分隔)"
              spellCheck={false}
              className="sm:col-span-2"
              value={form.smtp_to}
              onChange={(e) => set('smtp_to', e.target.value)}
            />
          </div>
        )}
        {WEBHOOK_URL_KINDS.includes(form.kind) && (
          <Input
            label={URL_LABEL[form.kind] ?? 'Webhook URL'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-[family-name:var(--font-mono)]"
            value={form.webhook_url}
            onChange={(e) => set('webhook_url', e.target.value)}
          />
        )}
        {form.kind === 'telegram' && (
          <Input
            label="Telegram chat id"
            spellCheck={false}
            value={form.telegram_chat_id}
            onChange={(e) => set('telegram_chat_id', e.target.value)}
          />
        )}

        {showSecret && (
          <Input
            label={`${secretLabel}${channel !== null ? ' · 留空保持不变' : ''}`}
            type="password"
            autoComplete="off"
            value={form.secret}
            onChange={(e) => set('secret', e.target.value)}
          />
        )}

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            {channel === null ? '创建渠道' : '保存'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** SettingsModal 评估设置弹窗:评估间隔与静默时长,admin 可改。 */
function SettingsModal({
  settings,
  isAdmin,
  onClose,
  onSaved,
}: {
  settings: Settings
  isAdmin: boolean
  onClose: () => void
  onSaved: (s: Settings) => void
}) {
  const [form, setForm] = useState<Settings>(settings)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!isAdmin || busy) return
    setBusy(true)
    setErr(null)
    try {
      const res = await apiFetch<Settings>('/api/m/alert/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      onSaved(res)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="评估设置" onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <Input
          label="评估间隔(秒,5–3600)"
          inputMode="numeric"
          value={String(form.interval_sec)}
          onChange={(e) => setForm((s) => ({ ...s, interval_sec: Number(e.target.value) || 0 }))}
        />
        <Input
          label="静默时长(秒,0–86400)"
          inputMode="numeric"
          value={String(form.silence_sec)}
          onChange={(e) => setForm((s) => ({ ...s, silence_sec: Number(e.target.value) || 0 }))}
        />

        {!isAdmin && <p className="text-xs text-muted">评估设置需要 admin 角色。</p>}

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={busy || !isAdmin}>
            {busy && <Spinner size={14} />}
            保存设置
          </Button>
        </div>
      </div>
    </Modal>
  )
}
