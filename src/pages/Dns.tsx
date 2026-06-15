import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const
type RecordType = (typeof RECORD_TYPES)[number]
const PRIORITY_TYPES = new Set<RecordType>(['MX', 'SRV'])

interface Domain {
  id: number
  name: string
  created_at: number
}

interface DnsRecord {
  id: number
  name: string
  type: string
  value: string
  ttl: number
  priority: number
}

interface RecordForm {
  id: number | null
  name: string
  type: RecordType
  value: string
  ttl: string
  priority: string
}

const emptyRecord: RecordForm = { id: null, name: '@', type: 'A', value: '', ttl: '3600', priority: '0' }

interface Settings {
  provider_kind: string
  provider_creds: string
  bind_zone_dir: string
}

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

/** DNS:域名与解析记录管理(增改删)+ provider 设置;读取需登录,写操作需 admin,删除走危险确认。 */
export default function Dns() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [domains, setDomains] = useState<Domain[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [newDomain, setNewDomain] = useState('')
  const [recForm, setRecForm] = useState<RecordForm>(emptyRecord)

  const [settings, setSettings] = useState<Settings | null>(null)
  const [credsSet, setCredsSet] = useState(false)

  const loadDomains = useCallback(async () => {
    setLoadErr(null)
    try {
      const [d, s] = await Promise.all([
        apiFetch<{ domains: Domain[] }>('/api/m/dns/domains'),
        apiFetch<{ settings: Settings; creds_set: boolean }>('/api/m/dns/settings'),
      ])
      setDomains(d.domains)
      setSettings(s.settings)
      setCredsSet(s.creds_set)
      setSelected((cur) => cur ?? d.domains[0]?.id ?? null)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRecords = useCallback(async (zoneId: number) => {
    setRecordsLoading(true)
    try {
      const r = await apiFetch<{ records: DnsRecord[] }>(`/api/m/dns/domains/${zoneId}/records`)
      setRecords(r.records)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setRecordsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDomains()
  }, [loadDomains])

  useEffect(() => {
    if (selected !== null) void loadRecords(selected)
    else setRecords([])
  }, [selected, loadRecords])

  async function createDomain() {
    const name = newDomain.trim()
    if (name.length === 0 || busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const d = await apiFetch<Domain>('/api/m/dns/domains', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setNewDomain('')
      setFeedback({ kind: 'ok', text: `域名 ${name} 已添加` })
      await loadDomains()
      setSelected(d.id)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function deleteDomain(d: Domain) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除域名 ${d.name} 及其全部记录?此操作危险且不可恢复。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/dns/domains/${d.id}`, { method: 'DELETE', headers: DANGER })
      setFeedback({ kind: 'ok', text: `域名 ${d.name} 已删除` })
      if (selected === d.id) setSelected(null)
      await loadDomains()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const recName = recForm.name.trim()
  const recValue = recForm.value.trim()
  const ttlNum = Number(recForm.ttl)
  const ttlValid = Number.isInteger(ttlNum) && ttlNum >= 60 && ttlNum <= 604800
  const canSubmitRecord =
    selected !== null && recName.length > 0 && recValue.length > 0 && ttlValid && !busy && isAdmin

  function recordPayload() {
    const priority = PRIORITY_TYPES.has(recForm.type) ? Number(recForm.priority) || 0 : 0
    return JSON.stringify({
      name: recName,
      type: recForm.type,
      value: recValue,
      ttl: ttlNum,
      priority,
    })
  }

  async function submitRecord() {
    if (!canSubmitRecord || selected === null) return
    setBusy(true)
    setFeedback(null)
    try {
      const base = `/api/m/dns/domains/${selected}/records`
      if (recForm.id === null) {
        await apiFetch(base, { method: 'POST', body: recordPayload() })
        setFeedback({ kind: 'ok', text: '记录已添加' })
      } else {
        await apiFetch(`${base}/${recForm.id}`, { method: 'PUT', body: recordPayload() })
        setFeedback({ kind: 'ok', text: '记录已更新' })
      }
      setRecForm(emptyRecord)
      await loadRecords(selected)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function deleteRecord(rec: DnsRecord) {
    if (!isAdmin || selected === null) return
    if (!window.confirm(`确认删除记录 ${rec.type} ${rec.name}?此操作危险。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/dns/domains/${selected}/records/${rec.id}`, {
        method: 'DELETE',
        headers: DANGER,
      })
      if (recForm.id === rec.id) setRecForm(emptyRecord)
      setFeedback({ kind: 'ok', text: '记录已删除' })
      await loadRecords(selected)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function editRecord(rec: DnsRecord) {
    setRecForm({
      id: rec.id,
      name: rec.name,
      type: (RECORD_TYPES as readonly string[]).includes(rec.type)
        ? (rec.type as RecordType)
        : 'A',
      value: rec.value,
      ttl: String(rec.ttl),
      priority: String(rec.priority),
    })
    setFeedback(null)
  }

  async function saveSettings() {
    if (!settings || busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<{ settings: Settings; creds_set: boolean }>('/api/m/dns/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setSettings({ ...res.settings, provider_creds: '' })
      setCredsSet(res.creds_set)
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function setS<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s))
  }

  const selectedDomain = domains.find((d) => d.id === selected) ?? null
  const showPriority = PRIORITY_TYPES.has(recForm.type)

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">域名</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label="新增域名"
            placeholder="例如 example.com"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="flex-1 font-[family-name:var(--font-mono)]"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
          />
          <Button onClick={() => void createDomain()} disabled={newDomain.trim().length === 0 || busy || !isAdmin}>
            添加域名
          </Button>
          {busy && <Spinner size={16} />}
        </div>
        {loading ? (
          <div className="flex h-16 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : loadErr && domains.length === 0 ? (
          <p className="text-sm text-muted">{loadErr}</p>
        ) : domains.length === 0 ? (
          <p className="text-sm text-muted">暂无域名。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <div
                key={d.id}
                className={`flex items-center gap-2 rounded-(--radius-card) border px-3 py-1.5 text-sm transition ${
                  selected === d.id
                    ? 'border-brand bg-brand-soft text-text'
                    : 'border-border text-muted hover:bg-surface-2'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelected(d.id)}
                  className="font-[family-name:var(--font-mono)] outline-none"
                >
                  {d.name}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => void deleteDomain(d)}
                    aria-label={`删除域名 ${d.name}`}
                    className="text-muted transition hover:text-crit"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {!isAdmin && <p className="text-xs text-muted">域名与记录的写操作需要 admin 角色。</p>}
        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}
      </Card>

      {selectedDomain && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">
            {recForm.id === null ? '新增记录' : `编辑记录 #${recForm.id}`} ·{' '}
            <span className="font-[family-name:var(--font-mono)] text-muted">{selectedDomain.name}</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">类型</span>
              <select
                value={recForm.type}
                onChange={(e) => setRecForm((f) => ({ ...f, type: e.target.value as RecordType }))}
                className={fieldClass}
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="主机记录"
              placeholder="@ 或 www"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={recForm.name}
              onChange={(e) => setRecForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="TTL(秒)"
              inputMode="numeric"
              value={recForm.ttl}
              error={recForm.ttl.length > 0 && !ttlValid ? 'TTL 需为 60–604800' : undefined}
              onChange={(e) => setRecForm((f) => ({ ...f, ttl: e.target.value }))}
            />
            {showPriority && (
              <Input
                label="优先级"
                inputMode="numeric"
                value={recForm.priority}
                onChange={(e) => setRecForm((f) => ({ ...f, priority: e.target.value }))}
              />
            )}
          </div>
          <Input
            label="记录值"
            placeholder="例如 192.0.2.1"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-[family-name:var(--font-mono)]"
            value={recForm.value}
            onChange={(e) => setRecForm((f) => ({ ...f, value: e.target.value }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void submitRecord()} disabled={!canSubmitRecord}>
              {recForm.id === null ? '添加记录' : '保存'}
            </Button>
            {recForm.id !== null && (
              <Button variant="ghost" onClick={() => setRecForm(emptyRecord)} disabled={busy}>
                取消
              </Button>
            )}
          </div>
        </Card>
      )}

      {selectedDomain && (
        <Card className="p-0">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm font-medium text-text">解析记录</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => selected !== null && void loadRecords(selected)}
              disabled={busy}
            >
              刷新
            </Button>
          </div>
          {recordsLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Spinner size={24} />
            </div>
          ) : records.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-muted">暂无解析记录。</p>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {records.map((rec) => (
                <div key={rec.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3 font-[family-name:var(--font-mono)] text-xs">
                    <span className="w-14 shrink-0 font-medium text-brand">{rec.type}</span>
                    <span className="w-28 shrink-0 truncate text-text">{rec.name}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{rec.value}</span>
                    <span className="shrink-0 text-muted">
                      ttl {rec.ttl}
                      {PRIORITY_TYPES.has(rec.type as RecordType) ? ` · pri ${rec.priority}` : ''}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => editRecord(rec)} disabled={!isAdmin}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void deleteRecord(rec)}
                      disabled={!isAdmin}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {settings && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">Provider 设置</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">provider 类型</span>
              <select
                value={settings.provider_kind}
                onChange={(e) => setS('provider_kind', e.target.value)}
                className={fieldClass}
              >
                <option value="bind">bind(本地 BIND)</option>
                <option value="mock">mock(示例/测试)</option>
              </select>
            </label>
            <Input
              label="BIND 区文件目录 (bind_zone_dir)"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              value={settings.bind_zone_dir}
              onChange={(e) => setS('bind_zone_dir', e.target.value)}
            />
          </div>
          <Input
            label={`provider 凭证 (provider_creds)${credsSet ? ' · 已配置' : ''}`}
            type="password"
            autoComplete="off"
            placeholder={credsSet ? '留空保持不变' : '云 provider API 凭证'}
            value={settings.provider_creds}
            onChange={(e) => setS('provider_creds', e.target.value)}
          />
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
