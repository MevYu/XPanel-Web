import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { CodeEditor } from '../components/CodeEditor'
import { Tabs } from '../components/Tabs'
import { Table, ActionLink, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { InstallGate } from '../components/InstallGate'
import { RefreshCw, X, Boxes } from 'lucide-react'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

// 文本端点(原始 php.ini、日志)走原始 fetch:apiFetch 强制 JSON.parse,纯文本响应会抛错。
async function fetchText(path: string): Promise<string> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

// 危险文本写入(原始 php.ini)走原始 fetch:body 为纯文本,带二次确认头。
async function putText(path: string, body: string): Promise<void> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain',
      ...(t ? { Authorization: `Bearer ${t.access}` } : {}),
      ...DANGER,
    },
    body,
  })
  if (!res.ok) throw new Error(await res.text())
}

const fieldClass =
  'h-8 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40'

interface VersionInfo {
  version: string
  banner: string
  fpm_unit: string
  fpm_active: boolean
  cli_default: boolean
}

interface CliInfo {
  available: boolean
  banner: string
}

interface IniField {
  key: string
  label: string
  group: string
  desc: string
}

interface FpmField {
  key: string
  label: string
  desc: string
}

interface FpmStatus {
  unit: string
  active: string
  status: string
}

type Feedback = { kind: 'ok' | 'err'; text: string } | null

function FeedbackLine({ msg }: { msg: Feedback }) {
  if (!msg) return null
  return (
    <p
      className={`rounded-(--radius-sm) border px-3 py-2 text-sm ${
        msg.kind === 'ok'
          ? 'border-online/40 bg-online/10 text-online'
          : 'border-crit/40 bg-crit/10 text-crit'
      }`}
    >
      {msg.text}
    </p>
  )
}

function Loading({ h = 'h-40' }: { h?: string }) {
  return (
    <div className={`flex ${h} items-center justify-center`}>
      <Spinner size={22} />
    </div>
  )
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="rounded-(--radius-sm) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
      {text}
    </p>
  )
}

// 分组区块:统一密度(p-4 / gap-3)与边界,贴合全站紧凑卡观感。
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface p-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  )
}

// ── 配置(ini 表单)──────────────────────────────────────────
function IniFormTab({ version, canWrite }: { version: string; canWrite: boolean }) {
  const [schema, setSchema] = useState<IniField[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Feedback>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [sc, vals] = await Promise.all([
        apiFetch<IniField[]>('/api/m/php/ini/schema'),
        apiFetch<Record<string, string>>(`/api/m/php/versions/${version}/ini`),
      ])
      setSchema(Array.isArray(sc) ? sc : [])
      setValues(vals ?? {})
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!canWrite) return
    setBusy(true)
    setMsg(null)
    try {
      const payload: Record<string, string> = {}
      for (const f of schema) {
        if (values[f.key] !== undefined) payload[f.key] = values[f.key]
      }
      const updated = await apiFetch<Record<string, string>>(
        `/api/m/php/versions/${version}/ini`,
        { method: 'PUT', body: JSON.stringify(payload) },
      )
      setValues(updated ?? payload)
      setMsg({ kind: 'ok', text: '配置已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (err) return <ErrorLine text={err} />
  if (schema.length === 0) return <p className="text-sm text-muted">无可配置项。</p>

  // 按 group 分组,保留 schema 出现顺序。
  const groups: { name: string; fields: IniField[] }[] = []
  for (const f of schema) {
    const g = f.group || '通用'
    let bucket = groups.find((x) => x.name === g)
    if (!bucket) {
      bucket = { name: g, fields: [] }
      groups.push(bucket)
    }
    bucket.fields.push(f)
  }

  return (
    <div className="flex flex-col gap-3">
      <FeedbackLine msg={msg} />
      {groups.map((g) => (
        <Section key={g.name} title={g.name}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.fields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <Input
                  label={f.label || f.key}
                  value={values[f.key] ?? ''}
                  spellCheck={false}
                  disabled={!canWrite}
                  onChange={(e) => setValues((m) => ({ ...m, [f.key]: e.target.value }))}
                />
                {f.desc && <span className="text-xs text-muted">{f.desc}</span>}
              </div>
            ))}
          </div>
        </Section>
      ))}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={!canWrite || busy}>
          {busy && <Spinner size={14} />}
          保存配置
        </Button>
        {!canWrite && <span className="text-xs text-muted">保存配置需要 admin 角色。</span>}
      </div>
    </div>
  )
}

// ── 原始 php.ini(危险)──────────────────────────────────────
function RawIniTab({ version, canWrite }: { version: string; canWrite: boolean }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Feedback>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setText(await fetchText(`/api/m/php/versions/${version}/ini/raw`))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!canWrite) return
    if (
      !window.confirm(
        `确认覆盖 PHP ${version} 的 php.ini?写入语法错误可能导致 php-fpm 无法启动,依赖站点会中断。`,
      )
    )
      return
    setBusy(true)
    setMsg(null)
    try {
      await putText(`/api/m/php/versions/${version}/ini/raw`, text)
      setMsg({ kind: 'ok', text: '原始 php.ini 已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (err) return <ErrorLine text={err} />

  return (
    <div className="flex flex-col gap-3">
      <FeedbackLine msg={msg} />
      <p className="text-xs text-warn">
        直接编辑原始文件,语法错误会导致 php-fpm 启动失败。请谨慎操作,保存需二次确认。
      </p>
      <CodeEditor
        value={text}
        onChange={setText}
        language="ini"
        readOnly={!canWrite}
        onSave={canWrite ? () => void save() : undefined}
        height="58vh"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="danger" onClick={() => void save()} disabled={!canWrite || busy}>
          {busy && <Spinner size={14} />}
          覆盖保存
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          重新加载
        </Button>
        {!canWrite && <span className="text-xs text-muted">编辑原始文件需要 admin 角色。</span>}
      </div>
    </div>
  )
}

// ── 禁用函数(危险)──────────────────────────────────────────
function DisabledFunctionsTab({ version, canWrite }: { version: string; canWrite: boolean }) {
  const [candidates, setCandidates] = useState<string[]>([])
  const [disabled, setDisabled] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Feedback>(null)
  const [custom, setCustom] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [cands, cur] = await Promise.all([
        apiFetch<string[]>('/api/m/php/disabled-functions/candidates'),
        apiFetch<string[]>(`/api/m/php/versions/${version}/disabled-functions`),
      ])
      setCandidates(Array.isArray(cands) ? cands : [])
      setDisabled(Array.isArray(cur) ? cur : [])
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    void load()
  }, [load])

  function toggle(fn: string) {
    setDisabled((cur) => (cur.includes(fn) ? cur.filter((x) => x !== fn) : [...cur, fn]))
  }

  function addCustom() {
    const name = custom.trim()
    if (!name || disabled.includes(name)) {
      setCustom('')
      return
    }
    setDisabled((cur) => [...cur, name])
    setCustom('')
  }

  async function save() {
    if (!canWrite) return
    if (
      !window.confirm(
        `确认更新 PHP ${version} 的禁用函数列表?错误禁用可能影响依赖站点的运行。`,
      )
    )
      return
    setBusy(true)
    setMsg(null)
    try {
      await apiFetch(`/api/m/php/versions/${version}/disabled-functions`, {
        method: 'PUT',
        headers: DANGER,
        body: JSON.stringify(disabled),
      })
      setMsg({ kind: 'ok', text: '禁用函数已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (err) return <ErrorLine text={err} />

  // 候选 ∪ 已禁用(后者可能含自定义项),保持候选顺序、自定义追加在后。
  const extra = disabled.filter((d) => !candidates.includes(d))
  const all = [...candidates, ...extra]

  return (
    <div className="flex flex-col gap-3">
      <FeedbackLine msg={msg} />
      <p className="text-xs text-muted">
        已禁用 {disabled.length} 个函数。勾选即加入禁用,保存后写入 php.ini 的 disable_functions。
      </p>
      <div className="flex flex-wrap gap-1.5">
        {all.map((fn) => {
          const on = disabled.includes(fn)
          return (
            <button
              key={fn}
              onClick={() => toggle(fn)}
              disabled={!canWrite}
              className={`inline-flex items-center gap-1.5 rounded-(--radius-sm) border px-2.5 py-1 font-[family-name:var(--font-mono)] text-xs transition outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-40 ${
                on
                  ? 'border-crit/40 bg-crit/10 text-crit'
                  : 'border-border bg-surface-2 text-muted hover:text-text'
              }`}
            >
              {on && <span className="h-1.5 w-1.5 rounded-full bg-crit" aria-hidden />}
              {fn}
            </button>
          )
        })}
      </div>
      <div className="flex items-end gap-2">
        <Input
          label="添加自定义函数"
          placeholder="函数名,如 system"
          className="flex-1"
          value={custom}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={!canWrite}
          onChange={(e) => setCustom(e.target.value)}
        />
        <Button
          size="md"
          variant="ghost"
          disabled={!canWrite || custom.trim().length === 0}
          onClick={addCustom}
        >
          添加
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="danger" onClick={() => void save()} disabled={!canWrite || busy}>
          {busy && <Spinner size={14} />}
          保存禁用函数
        </Button>
        {!canWrite && <span className="text-xs text-muted">修改禁用函数需要 admin 角色。</span>}
      </div>
    </div>
  )
}

// ── FPM 参数(危险)+ 状态 ────────────────────────────────────
function FpmTab({ version, canWrite }: { version: string; canWrite: boolean }) {
  const [schema, setSchema] = useState<FpmField[]>([])
  const [config, setConfig] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<FpmStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Feedback>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [sc, cfg, st] = await Promise.all([
        apiFetch<FpmField[]>('/api/m/php/fpm/schema'),
        apiFetch<Record<string, string>>(`/api/m/php/versions/${version}/fpm/config`),
        apiFetch<FpmStatus>(`/api/m/php/versions/${version}/fpm/status`),
      ])
      setSchema(Array.isArray(sc) ? sc : [])
      setConfig(cfg ?? {})
      setStatus(st ?? null)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!canWrite) return
    if (
      !window.confirm(
        `确认更新 PHP ${version} 的 php-fpm 进程参数?保存后需重启 php-fpm 才生效,可能短暂中断站点。`,
      )
    )
      return
    setBusy(true)
    setMsg(null)
    try {
      const payload: Record<string, string> = {}
      for (const f of schema) {
        if (config[f.key] !== undefined) payload[f.key] = config[f.key]
      }
      await apiFetch(`/api/m/php/versions/${version}/fpm/config`, {
        method: 'PUT',
        headers: DANGER,
        body: JSON.stringify(payload),
      })
      setMsg({ kind: 'ok', text: 'FPM 参数已保存' })
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function fpmAction(verb: 'start' | 'stop' | 'restart') {
    if (!canWrite || busy) return
    if (verb === 'stop' && !window.confirm('确认停止 php-fpm?依赖此版本的站点将中断。')) return
    setBusy(true)
    setMsg(null)
    try {
      await apiFetch(`/api/m/php/versions/${version}/fpm/${verb}`, { method: 'POST', headers: DANGER })
      setMsg({
        kind: 'ok',
        text: `php-fpm 已${verb === 'start' ? '启动' : verb === 'stop' ? '停止' : '重启'}`,
      })
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (err) return <ErrorLine text={err} />

  const running = status?.active === 'active'

  return (
    <div className="flex flex-col gap-3">
      <FeedbackLine msg={msg} />
      {status && (
        <Section title="运行状态">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={running ? 'online' : 'neutral'}>
              {running ? '运行中' : status.active || '已停止'}
            </Badge>
            {status.unit && (
              <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
                {status.unit}
              </span>
            )}
          </div>
          {status.status && (
            <pre className="max-h-48 overflow-auto rounded-(--radius-sm) bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
              {status.status.trim()}
            </pre>
          )}
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => void fpmAction('start')} disabled={busy}>
                启动
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void fpmAction('stop')} disabled={busy}>
                停止
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void fpmAction('restart')} disabled={busy}>
                重启
              </Button>
            </div>
          )}
        </Section>
      )}
      <Section title="进程参数">
        {schema.length === 0 ? (
          <p className="text-sm text-muted">无可配置项。</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {schema.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <Input
                  label={f.label || f.key}
                  value={config[f.key] ?? ''}
                  spellCheck={false}
                  disabled={!canWrite}
                  onChange={(e) => setConfig((m) => ({ ...m, [f.key]: e.target.value }))}
                />
                {f.desc && <span className="text-xs text-muted">{f.desc}</span>}
              </div>
            ))}
          </div>
        )}
      </Section>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="danger" onClick={() => void save()} disabled={!canWrite || busy}>
          {busy && <Spinner size={14} />}
          保存 FPM 参数
        </Button>
        {!canWrite && <span className="text-xs text-muted">修改 FPM 参数需要 admin 角色。</span>}
      </div>
    </div>
  )
}

// ── 日志查看(慢日志 / 错误日志)──────────────────────────────
function LogTab({ version, kind }: { version: string; kind: 'slow' | 'error' }) {
  const [lines, setLines] = useState(200)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setContent(await fetchText(`/api/m/php/versions/${version}/log/${kind}?lines=${lines}`))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [version, kind, lines])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={lines}
          onChange={(e) => setLines(Number(e.target.value))}
          className={`${fieldClass} w-28`}
        >
          {[100, 200, 500, 1000].map((n) => (
            <option key={n} value={n}>
              末 {n} 行
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} />
          刷新
        </Button>
      </div>
      {loading ? (
        <Loading h="h-64" />
      ) : err ? (
        <ErrorLine text={err} />
      ) : content.trim() === '' ? (
        <div className="flex h-64 items-center justify-center rounded-(--radius-card) border border-dashed border-border text-sm text-muted">
          日志为空。
        </div>
      ) : (
        <pre className="max-h-[56vh] overflow-auto rounded-(--radius-card) border border-border bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text">
          {content}
        </pre>
      )}
    </div>
  )
}

// ── 扩展管理(列已加载扩展 + 启用/禁用)─────────────────────
function ExtensionsTab({ version, canWrite }: { version: string; canWrite: boolean }) {
  const [exts, setExts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [newExt, setNewExt] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setExts(await apiFetch<string[]>(`/api/m/php/versions/${version}/extensions`))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(ext: string, op: 'enable' | 'disable') {
    if (!ext || !canWrite || busy) return
    if (op === 'disable' && !window.confirm(`确认禁用扩展 ${ext}?需重启 php-fpm 生效,可能影响依赖站点。`)) return
    setBusy(true)
    setMsg(null)
    try {
      await apiFetch(`/api/m/php/versions/${version}/extensions/${encodeURIComponent(ext)}/${op}`, {
        method: 'POST',
        headers: DANGER,
      })
      setMsg({ kind: 'ok', text: `已${op === 'enable' ? '启用' : '禁用'} ${ext}(重启 php-fpm 后生效)` })
      if (op === 'enable') setNewExt('')
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (err) return <ErrorLine text={err} />

  return (
    <div className="flex flex-col gap-3">
      <FeedbackLine msg={msg} />
      {canWrite && (
        <Section title="启用扩展">
          <div className="flex items-end gap-2">
            <input
              className={`${fieldClass} flex-1`}
              placeholder="扩展名,如 redis / gd / opcache"
              spellCheck={false}
              value={newExt}
              onChange={(e) => setNewExt(e.target.value)}
            />
            <Button size="sm" onClick={() => void toggle(newExt.trim(), 'enable')} disabled={!newExt.trim() || busy}>
              启用
            </Button>
          </div>
        </Section>
      )}
      <Section title={`已加载扩展 (${exts.length})`}>
        <div className="flex flex-wrap gap-2">
          {exts.map((ext) => (
            <span
              key={ext}
              className="inline-flex items-center gap-1.5 rounded-(--radius-sm) border border-border bg-surface-2 px-2.5 py-1 text-xs"
            >
              <span className="font-[family-name:var(--font-mono)] text-text">{ext}</span>
              {canWrite && (
                <button
                  onClick={() => void toggle(ext, 'disable')}
                  disabled={busy}
                  className="text-faint transition hover:text-crit"
                  aria-label={`禁用 ${ext}`}
                >
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
          {exts.length === 0 && <p className="text-sm text-muted">无已加载扩展。</p>}
        </div>
      </Section>
    </div>
  )
}

type TabKey = 'ini' | 'raw' | 'disabled' | 'fpm' | 'extensions' | 'slow' | 'error'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ini', label: '配置' },
  { key: 'raw', label: '原始 php.ini' },
  { key: 'disabled', label: '禁用函数' },
  { key: 'fpm', label: 'FPM 参数' },
  { key: 'extensions', label: '扩展' },
  { key: 'slow', label: '慢日志' },
  { key: 'error', label: '错误日志' },
]

function VersionDetail({ version, canWrite }: { version: string; canWrite: boolean }) {
  const [tab, setTab] = useState<TabKey>('ini')

  let body: ReactNode
  switch (tab) {
    case 'ini':
      body = <IniFormTab version={version} canWrite={canWrite} />
      break
    case 'raw':
      body = <RawIniTab version={version} canWrite={canWrite} />
      break
    case 'disabled':
      body = <DisabledFunctionsTab version={version} canWrite={canWrite} />
      break
    case 'fpm':
      body = <FpmTab version={version} canWrite={canWrite} />
      break
    case 'extensions':
      body = <ExtensionsTab version={version} canWrite={canWrite} />
      break
    case 'slow':
      body = <LogTab version={version} kind="slow" />
      break
    case 'error':
      body = <LogTab version={version} kind="error" />
      break
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {/* version 作 key:切版本时重置各 tab 内部状态,避免串数据。 */}
      <div key={`${version}-${tab}`}>{body}</div>
    </div>
  )
}

/** Php:已装版本选择 + CLI 默认横幅;选中版本后分 tab 管理 ini 配置/原始文件/禁用函数/FPM/日志。 */
export default function Php() {
  const { role } = useAuth()
  const canWrite = role === 'admin'

  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [cli, setCli] = useState<CliInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      const [vers, cliInfo] = await Promise.all([
        apiFetch<VersionInfo[]>('/api/m/php/versions'),
        apiFetch<CliInfo>('/api/m/php/cli').catch(() => null),
      ])
      const list = Array.isArray(vers) ? vers : []
      setVersions(list)
      setCli(cliInfo)
      setSelected((cur) => {
        if (cur && list.some((v) => v.version === cur)) return cur
        return list.length > 0 ? list[0].version : null
      })
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // aaPanel 工具栏:左侧标题,右侧刷新。
  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-sm font-medium text-text">PHP 版本</h3>
      <Button variant="ghost" size="md" onClick={() => void load()} disabled={loading}>
        <RefreshCw size={15} />
        刷新
      </Button>
    </div>
  )

  const columns: Column<VersionInfo>[] = [
    {
      key: 'version',
      header: '版本',
      cell: (v) => (
        <button
          type="button"
          onClick={() => setSelected(v.version)}
          className="inline-flex items-center gap-2 self-start rounded-sm font-medium text-text outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <Boxes size={15} className="shrink-0 text-muted" />
          <span>PHP {v.version}</span>
        </button>
      ),
    },
    {
      key: 'fpm',
      header: 'FPM 状态',
      width: '120px',
      cell: (v) => (
        <Badge status={v.fpm_active ? 'online' : 'neutral'}>{v.fpm_active ? '运行中' : '已停止'}</Badge>
      ),
    },
    {
      key: 'cli',
      header: 'CLI 默认',
      width: '100px',
      cell: (v) =>
        v.cli_default ? <Badge status="online">默认</Badge> : <span className="text-xs text-faint">—</span>,
    },
    {
      key: 'banner',
      header: '横幅',
      cell: (v) => (
        <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{v.banner || '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '72px',
      align: 'right',
      cell: (v) => (
        <ActionLink onClick={() => setSelected(v.version)}>管理</ActionLink>
      ),
    },
  ]

  return (
    <InstallGate moduleId="php">
    <div className="flex flex-col gap-4">
      {toolbar}

      {loadErr && versions.length === 0 && !loading && (
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
          columns={columns}
          rows={versions}
          rowKey={(v) => v.version}
          emptyText={
            <EmptyState
              icon={<Boxes />}
              title="未检测到 PHP"
              hint="系统中没有可管理的 PHP 版本。请前往软件商店安装 PHP 后再回到本页配置。"
            />
          }
        />
      )}

      {cli && versions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-(--radius-sm) border border-border bg-surface-2 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">命令行默认</span>
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">
            {cli.available ? cli.banner || '可用' : '命令行未配置默认 PHP'}
          </span>
        </div>
      )}

      {selected && versions.length > 0 && <VersionDetail version={selected} canWrite={canWrite} />}

      {!canWrite && versions.length > 0 && (
        <p className="text-xs text-muted">配置、禁用函数与 FPM 参数等写操作需要 admin 角色。</p>
      )}
    </div>
    </InstallGate>
  )
}
