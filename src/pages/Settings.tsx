import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import { ShieldCheck, Network, DoorOpen, Plus, X, AlertTriangle } from 'lucide-react'

// 本页类型,不进共享 types。GET /api/settings 不含敏感值。
interface PanelSettings {
  login_max_attempts: number
  ip_ban_hours: number
  entry_probe_max: number
  entry_probe_window_minutes: number
  trusted_proxies: string[]
  entry_path: string
  addr: string
}

// PUT body 指针语义:只传要改的字段。改 entry_path/addr 需 X-Confirm-Danger。
interface SettingsPatch {
  login_max_attempts?: number
  ip_ban_hours?: number
  entry_probe_max?: number
  entry_probe_window_minutes?: number
  trusted_proxies?: string[]
  entry_path?: string
  addr?: string
}

interface SaveResult {
  restart_required: string[]
}

const DANGER = { 'X-Confirm-Danger': '1' }

// 字段中文名,用于"需重启"提示与变更预览。
const FIELD_LABEL: Record<string, string> = {
  login_max_attempts: '登录失败上限',
  ip_ban_hours: 'IP 封禁时长',
  entry_probe_max: '入口探测上限',
  entry_probe_window_minutes: '入口探测窗口',
  trusted_proxies: '可信代理',
  entry_path: '面板入口路径',
  addr: '监听地址',
}

const NUM_KEYS = [
  'login_max_attempts',
  'ip_ban_hours',
  'entry_probe_max',
  'entry_probe_window_minutes',
] as const

type TabKey = 'security' | 'network' | 'entry'

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: 'security', label: '安全', icon: <ShieldCheck size={15} /> },
  { key: 'network', label: '网络', icon: <Network size={15} /> },
  { key: 'entry', label: '入口与监听', icon: <DoorOpen size={15} /> },
]

// crypto.randomUUID 在本仓库禁用,用 uid() 给可信代理行打稳定 key。
let uidSeq = 0
function uid(): string {
  uidSeq += 1
  return `id-${Date.now().toString(36)}-${uidSeq}`
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function normProxies(list: string[]): string[] {
  return list.map((p) => p.trim()).filter(Boolean)
}

function sameProxies(a: string[], b: string[]): boolean {
  const na = normProxies(a)
  const nb = normProxies(b)
  return na.length === nb.length && na.every((v, i) => v === nb[i])
}

/** Settings 面板设置:左竖 tab(安全 / 网络 / 入口与监听)+ 右侧行式配置;改入口与监听走危险确认 + 重启提示。仅 admin 可改。 */
export default function Settings() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [tab, setTab] = useState<TabKey>('security')

  const [loaded, setLoaded] = useState<PanelSettings | null>(null)
  const [form, setForm] = useState<PanelSettings | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [restartRequired, setRestartRequired] = useState<string[] | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    setSaveErr(null)
    setRestartRequired(null)
    try {
      const s = await apiFetch<PanelSettings>('/api/settings')
      setLoaded(s)
      setForm({ ...s, trusted_proxies: [...s.trusted_proxies] })
    } catch (e) {
      setLoadErr(errorText(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function setField<K extends keyof PanelSettings>(key: K, value: PanelSettings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setRestartRequired(null)
    setSaveErr(null)
  }

  // 只把改动字段放进 patch(指针语义);entry_path/addr 改动标记 danger。
  function buildPatch(): { patch: SettingsPatch; danger: boolean } {
    const patch: SettingsPatch = {}
    if (!form || !loaded) return { patch, danger: false }
    for (const k of NUM_KEYS) {
      if (form[k] !== loaded[k]) patch[k] = form[k]
    }
    if (!sameProxies(form.trusted_proxies, loaded.trusted_proxies)) {
      patch.trusted_proxies = normProxies(form.trusted_proxies)
    }
    let danger = false
    if (form.entry_path !== loaded.entry_path) {
      patch.entry_path = form.entry_path
      danger = true
    }
    if (form.addr !== loaded.addr) {
      patch.addr = form.addr
      danger = true
    }
    return { patch, danger }
  }

  async function submit() {
    if (!form || !loaded || !isAdmin) return
    const { patch, danger } = buildPatch()
    if (Object.keys(patch).length === 0) return
    setBusy(true)
    setSaveErr(null)
    setRestartRequired(null)
    try {
      const res = await apiFetch<SaveResult>('/api/settings', {
        method: 'PUT',
        ...(danger ? { headers: DANGER } : {}),
        body: JSON.stringify(patch),
      })
      // 成功后以提交值为新基线,清掉 dirty 态。
      const next: PanelSettings = { ...form, trusted_proxies: normProxies(form.trusted_proxies) }
      setLoaded(next)
      setForm({ ...next, trusted_proxies: [...next.trusted_proxies] })
      setRestartRequired(res.restart_required ?? [])
      setConfirmOpen(false)
    } catch (e) {
      setSaveErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  function onSaveClick() {
    if (!form || !loaded) return
    const { patch, danger } = buildPatch()
    if (Object.keys(patch).length === 0) return
    if (danger) {
      setConfirmOpen(true)
      return
    }
    void submit()
  }

  if (!form || !loaded) {
    return (
      <div className="flex flex-col gap-4">
        {loadErr && (
          <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {loadErr}
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              重试
            </Button>
          </p>
        )}
        <div className="h-64 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      </div>
    )
  }

  const { patch } = buildPatch()
  const dirty = Object.keys(patch).length > 0

  return (
    <div className="flex flex-col gap-3">
      {!isAdmin && (
        <p className="rounded-(--radius-card) border border-border bg-surface px-3 py-2 text-xs text-muted">
          面板设置为只读;修改需要 admin 角色。
        </p>
      )}

      <Card className="flex flex-col gap-0 p-0 sm:flex-row sm:items-stretch">
        {/* 左竖 tab */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2 sm:w-48 sm:flex-col sm:overflow-x-visible sm:border-b-0 sm:border-r">
          {TABS.map((t) => {
            const on = t.key === tab
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`relative flex h-9 shrink-0 items-center gap-2 rounded-(--radius-sm) border px-3 text-left text-sm font-medium outline-none transition-colors duration-(--dur-micro) ease-(--ease-out) focus-visible:ring-2 focus-visible:ring-brand/60 ${
                  on ? 'nav-active text-text' : 'border-transparent text-muted hover:bg-surface-2/60 hover:text-text'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            )
          })}
        </nav>

        {/* 右侧行式配置 */}
        <div className="min-w-0 flex-1 px-3 py-1 sm:px-5 sm:py-2">
          {tab === 'security' && (
            <SettingRows>
              <SectionHead label="登录防护" />
              <NumberRow
                label="登录失败上限"
                desc="连续登录失败达到此次数后封禁来源 IP。"
                value={form.login_max_attempts}
                disabled={!isAdmin}
                onChange={(v) => setField('login_max_attempts', v)}
              />
              <NumberRow
                label="IP 封禁时长"
                unit="小时"
                desc="触发封禁后,来源 IP 被拒绝访问的时长。"
                value={form.ip_ban_hours}
                disabled={!isAdmin}
                onChange={(v) => setField('ip_ban_hours', v)}
                last
              />
              <SectionHead label="入口探测防护" />
              <NumberRow
                label="入口探测上限"
                desc="窗口期内对错误入口路径的最大探测次数。"
                value={form.entry_probe_max}
                disabled={!isAdmin}
                onChange={(v) => setField('entry_probe_max', v)}
              />
              <NumberRow
                label="入口探测窗口"
                unit="分钟"
                desc="统计入口探测次数的滑动窗口长度。"
                value={form.entry_probe_window_minutes}
                disabled={!isAdmin}
                onChange={(v) => setField('entry_probe_window_minutes', v)}
                last
              />
            </SettingRows>
          )}

          {tab === 'network' && (
            <SettingRows>
              <Row
                label="可信代理"
                desc="位于面板前的反代 IP / 网段,用于解析真实客户端来源。"
                stacked
                last
              >
                <ProxyList
                  values={form.trusted_proxies}
                  disabled={!isAdmin}
                  onChange={(list) => setField('trusted_proxies', list)}
                />
              </Row>
            </SettingRows>
          )}

          {tab === 'entry' && (
            <SettingRows>
              <SectionHead
                label="入口与监听"
                hint={
                  <span className="inline-flex items-center gap-1 text-warn">
                    <AlertTriangle size={12} />
                    修改需重启生效
                  </span>
                }
              />
              <TextRow
                label="面板入口路径"
                desc="访问面板需附加的隐藏路径前缀。"
                value={form.entry_path}
                placeholder="/xpanel"
                disabled={!isAdmin}
                onChange={(v) => setField('entry_path', v)}
              />
              <TextRow
                label="监听地址"
                desc="面板 HTTP 服务绑定的地址与端口。"
                value={form.addr}
                placeholder="0.0.0.0:8765"
                disabled={!isAdmin}
                onChange={(v) => setField('addr', v)}
                last
              />
            </SettingRows>
          )}
        </div>
      </Card>

      {saveErr && <p className="text-sm text-crit">{saveErr}</p>}

      {restartRequired != null &&
        (restartRequired.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-(--radius-card) border border-warn/40 bg-warn/10 px-3 py-2.5 text-sm text-warn">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              已保存。以下设置需重启面板生效:
              <span className="font-medium text-text">
                {' '}
                {restartRequired.map((k) => FIELD_LABEL[k] ?? k).join('、')}
              </span>
            </span>
          </div>
        ) : (
          <p className="text-sm text-online">已保存。</p>
        ))}

      {isAdmin && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" disabled={!dirty || busy} onClick={() => void load()}>
            重置
          </Button>
          <Button disabled={!dirty || busy} onClick={onSaveClick}>
            {busy && <Spinner size={14} />}
            保存
          </Button>
        </div>
      )}

      {confirmOpen && (
        <ConfirmDanger
          busy={busy}
          changes={[
            patch.entry_path !== undefined
              ? { label: '面板入口路径', from: loaded.entry_path, to: patch.entry_path }
              : null,
            patch.addr !== undefined
              ? { label: '监听地址', from: loaded.addr, to: patch.addr }
              : null,
          ].filter((c): c is ChangePreview => c !== null)}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void submit()}
        />
      )}
    </div>
  )
}

function SettingRows({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>
}

/** tab 内的小节标题:对标 aaPanel 行式配置的分组带,左侧标签 + 可选右侧提示。 */
function SectionHead({ label, hint }: { label: string; hint?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 pb-1.5 pt-4 first:pt-1">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      {hint && <span className="text-[0.6875rem] font-medium">{hint}</span>}
    </div>
  )
}

/** 单条配置行:label + 说明在左,control 在右;stacked 时 control 换行铺满。底部 hairline 分隔,last 去掉。 */
function Row({
  label,
  desc,
  children,
  stacked,
  last,
}: {
  label: string
  desc?: string
  children: ReactNode
  stacked?: boolean
  last?: boolean
}) {
  return (
    <div
      className={`${last ? '' : 'border-b border-border/60'} py-2.5 ${
        stacked ? 'flex flex-col gap-2.5' : 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2'
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-text">{label}</div>
        {desc && <p className="mt-0.5 text-xs text-muted">{desc}</p>}
      </div>
      <div className={stacked ? '' : 'shrink-0'}>{children}</div>
    </div>
  )
}

function NumberRow({
  label,
  desc,
  unit,
  value,
  disabled,
  onChange,
  last,
}: {
  label: string
  desc?: string
  unit?: string
  value: number
  disabled: boolean
  onChange: (v: number) => void
  last?: boolean
}) {
  return (
    <Row label={label} desc={desc} last={last}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={Number.isFinite(value) ? String(value) : ''}
          disabled={disabled}
          onChange={(e) => {
            const n = e.target.valueAsNumber
            onChange(Number.isNaN(n) ? 0 : n)
          }}
          className="h-9 w-28 rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 text-sm text-text outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] transition-[border-color,box-shadow,background-color] duration-(--dur-micro) ease-(--ease-out) hover:border-border-strong focus:border-brand focus:bg-surface-2 focus:shadow-[0_0_0_3px_var(--color-brand-soft),inset_0_1px_2px_rgba(0,0,0,0.25)] disabled:cursor-not-allowed disabled:opacity-40"
        />
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
    </Row>
  )
}

function TextRow({
  label,
  desc,
  value,
  placeholder,
  disabled,
  onChange,
  last,
}: {
  label: string
  desc?: string
  value: string
  placeholder?: string
  disabled: boolean
  onChange: (v: string) => void
  last?: boolean
}) {
  return (
    <Row label={label} desc={desc} last={last}>
      <input
        value={value}
        disabled={disabled}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-0 rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 font-[family-name:var(--font-mono)] text-sm text-text outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] transition-[border-color,box-shadow,background-color] duration-(--dur-micro) ease-(--ease-out) placeholder:text-faint hover:border-border-strong focus:border-brand focus:bg-surface-2 focus:shadow-[0_0_0_3px_var(--color-brand-soft),inset_0_1px_2px_rgba(0,0,0,0.25)] disabled:cursor-not-allowed disabled:opacity-40 sm:w-72"
      />
    </Row>
  )
}

interface ProxyRow {
  id: string
  value: string
}

function ProxyList({
  values,
  disabled,
  onChange,
}: {
  values: string[]
  disabled: boolean
  onChange: (list: string[]) => void
}) {
  // 行需稳定 key 防编辑时焦点错乱;rowsRef 跟 values 长度对齐,补位用 uid()。
  const rowsRef = useRef<ProxyRow[]>([])
  const rows: ProxyRow[] = values.map((v, i) => ({
    id: rowsRef.current[i]?.id ?? uid(),
    value: v,
  }))
  rowsRef.current = rows

  function update(i: number, v: string) {
    const next = values.slice()
    next[i] = v
    onChange(next)
  }
  function add() {
    rowsRef.current = [...rowsRef.current, { id: uid(), value: '' }]
    onChange([...values, ''])
  }
  function remove(i: number) {
    rowsRef.current = rowsRef.current.filter((_, j) => j !== i)
    onChange(values.filter((_, j) => j !== i))
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <p className="rounded-(--radius-card) border border-dashed border-border bg-surface-2/40 px-3 py-3 text-center text-xs text-muted">
          未配置可信代理。
        </p>
      )}
      {rows.map((row, i) => (
        <div key={row.id} className="flex items-center gap-2">
          <input
            value={row.value}
            disabled={disabled}
            spellCheck={false}
            placeholder="10.0.0.0/8 或 192.168.1.1"
            onChange={(e) => update(i, e.target.value)}
            className="h-9 flex-1 rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 font-[family-name:var(--font-mono)] text-sm text-text outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] transition placeholder:text-faint hover:border-border-strong focus:border-brand focus:bg-surface-2 focus:shadow-[0_0_0_3px_var(--color-brand-soft),inset_0_1px_2px_rgba(0,0,0,0.25)] disabled:cursor-not-allowed disabled:opacity-40"
          />
          <button
            type="button"
            disabled={disabled}
            aria-label="删除此项"
            onClick={() => remove(i)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-sm) border border-border text-muted transition hover:border-crit/50 hover:text-crit disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </div>
      ))}
      {!disabled && (
        <Button variant="ghost" size="sm" className="self-start" onClick={add}>
          <Plus size={14} />
          添加代理
        </Button>
      )}
    </div>
  )
}

interface ChangePreview {
  label: string
  from: string
  to: string
}

function ConfirmDanger({
  busy,
  changes,
  onCancel,
  onConfirm,
}: {
  busy: boolean
  changes: ChangePreview[]
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <Card
        className="flex w-full max-w-md flex-col gap-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-text">
            确认修改入口与监听
          </h3>
          <button
            onClick={onCancel}
            aria-label="关闭"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-surface-2 hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-start gap-2.5 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2.5 text-sm text-crit">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            你正在修改面板入口路径或监听地址。配置错误可能导致面板无法访问,且需重启面板后才生效。
          </span>
        </div>

        <dl className="flex flex-col gap-2.5">
          {changes.map((c) => (
            <div key={c.label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted">{c.label}</dt>
              <dd className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-xs">
                <span className="text-muted line-through">{c.from || '(空)'}</span>
                <span className="text-muted">→</span>
                <span className="text-text">{c.to || '(空)'}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            取消
          </Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>
            {busy && <Spinner size={14} />}
            确认并保存
          </Button>
        </div>
      </Card>
    </div>
  )
}
