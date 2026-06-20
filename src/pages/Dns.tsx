import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Input } from '../components/Input'
import { Spinner } from '../components/Spinner'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Plus, Settings2, RefreshCw, Globe, X } from 'lucide-react'
import {
  type Domain,
  type DnsRecord,
  type RecordType,
  PRIORITY_TYPES,
  DANGER,
  errorText,
} from './dns/shared'
import { RecordModal } from './dns/RecordModal'
import { DnsSettingsModal } from './dns/DnsSettingsModal'

/** DNS:aaPanel 风格 —— 顶部工具栏(域名选择 + 添加/设置)+ 解析记录紧凑表 + 固定尺寸弹窗表单。 */
export default function Dns() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [domains, setDomains] = useState<Domain[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recErr, setRecErr] = useState<string | null>(null)

  const [addDomainOpen, setAddDomainOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recordModal, setRecordModal] = useState<{ open: boolean; rec: DnsRecord | null }>({
    open: false,
    rec: null,
  })

  const loadDomains = useCallback(async () => {
    setLoadErr(null)
    try {
      const d = await apiFetch<{ domains: Domain[] }>('/api/m/dns/domains')
      setDomains(d.domains)
      setSelected((cur) => cur ?? d.domains[0]?.id ?? null)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRecords = useCallback(async (zoneId: number) => {
    setRecordsLoading(true)
    setRecErr(null)
    try {
      const r = await apiFetch<{ records: DnsRecord[] }>(`/api/m/dns/domains/${zoneId}/records`)
      setRecords(r.records)
    } catch (e) {
      setRecErr(errorText(e))
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

  async function deleteDomain(d: Domain) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除域名 ${d.name} 及其全部记录?此操作危险且不可恢复。`)) return
    try {
      await apiFetch(`/api/m/dns/domains/${d.id}`, { method: 'DELETE', headers: DANGER })
      if (selected === d.id) setSelected(null)
      await loadDomains()
    } catch (e) {
      setLoadErr(errorText(e))
    }
  }

  async function deleteRecord(rec: DnsRecord) {
    if (!isAdmin || selected === null) return
    if (!window.confirm(`确认删除记录 ${rec.type} ${rec.name}?此操作危险。`)) return
    try {
      await apiFetch(`/api/m/dns/domains/${selected}/records/${rec.id}`, {
        method: 'DELETE',
        headers: DANGER,
      })
      await loadRecords(selected)
    } catch (e) {
      setRecErr(errorText(e))
    }
  }

  const selectedDomain = useMemo(
    () => domains.find((d) => d.id === selected) ?? null,
    [domains, selected],
  )

  const columns: Column<DnsRecord>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '主机记录',
        width: '20%',
        cell: (r) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-text">{r.name}</span>
        ),
      },
      {
        key: 'type',
        header: '类型',
        width: '88px',
        cell: (r) => <span className="font-medium text-brand">{r.type}</span>,
      },
      {
        key: 'value',
        header: '记录值',
        cell: (r) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {r.value}
          </span>
        ),
      },
      {
        key: 'ttl',
        header: 'TTL',
        width: '120px',
        cell: (r) => (
          <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
            {r.ttl}
            {PRIORITY_TYPES.has(r.type as RecordType) ? ` · pri ${r.priority}` : ''}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '120px',
        align: 'right',
        cell: (r) => (
          <ActionLinks>
            <ActionLink disabled={!isAdmin} onClick={() => setRecordModal({ open: true, rec: r })}>
              编辑
            </ActionLink>
            <ActionLink
              danger
              disabled={!isAdmin}
              aria-label="删除记录"
              title={isAdmin ? '删除记录' : '需要 admin 角色'}
              onClick={() => void deleteRecord(r)}
            >
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, selected],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="md"
            disabled={!isAdmin || selected === null}
            onClick={() => setRecordModal({ open: true, rec: null })}
          >
            <Plus size={15} />
            添加记录
          </Button>
          <Button variant="ghost" size="md" disabled={!isAdmin} onClick={() => setAddDomainOpen(true)}>
            <Plus size={15} />
            添加域名
          </Button>
          <Button variant="ghost" size="md" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} />
            服务商设置
          </Button>
        </div>
        {selected !== null && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => void loadRecords(selected)}
            disabled={recordsLoading}
          >
            <RefreshCw size={15} className={recordsLoading ? 'animate-spin' : ''} />
            刷新
          </Button>
        )}
      </div>

      {loadErr && domains.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void loadDomains()}>
            重试
          </Button>
        </p>
      )}

      {!loading && domains.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">域名</span>
          {domains.map((d) => {
            const active = selected === d.id
            return (
              <span
                key={d.id}
                className={`inline-flex items-center gap-2 rounded-(--radius-sm) border px-3 py-1.5 text-sm transition ${
                  active
                    ? 'border-brand bg-brand-soft text-text'
                    : 'border-border text-muted hover:bg-surface-2'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelected(d.id)}
                  className="inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] outline-none"
                >
                  <Globe size={13} className={active ? 'text-brand' : 'text-muted'} />
                  {d.name}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => void deleteDomain(d)}
                    aria-label={`删除域名 ${d.name}`}
                    title="删除域名"
                    className="text-muted transition hover:text-crit"
                  >
                    <X size={13} />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {recErr && selected !== null && (
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {recErr}
        </p>
      )}

      {loading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : recordsLoading ? (
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : (
        <Table
          columns={columns}
          rows={selected === null ? [] : records}
          rowKey={(r) => r.id}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">
                {domains.length === 0 ? '还没有域名' : '该域名暂无解析记录'}
              </span>
              <span className="text-xs text-muted">
                {domains.length === 0
                  ? '点击「添加域名」开始管理你的 DNS。'
                  : isAdmin
                    ? '点击「添加记录」创建第一条解析。'
                    : '记录的写操作需要 admin 角色。'}
              </span>
            </span>
          }
        />
      )}

      {!isAdmin && <p className="text-xs text-muted">域名与记录的写操作需要 admin 角色。</p>}

      {addDomainOpen && (
        <AddDomainModal
          onClose={() => setAddDomainOpen(false)}
          onCreated={async (id) => {
            setAddDomainOpen(false)
            await loadDomains()
            setSelected(id)
          }}
        />
      )}
      {settingsOpen && (
        <DnsSettingsModal
          isAdmin={isAdmin}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {}}
        />
      )}
      {recordModal.open && selectedDomain && (
        <RecordModal
          zoneId={selectedDomain.id}
          zoneName={selectedDomain.name}
          record={recordModal.rec}
          onClose={() => setRecordModal({ open: false, rec: null })}
          onSaved={() => {
            setRecordModal({ open: false, rec: null })
            void loadRecords(selectedDomain.id)
          }}
        />
      )}
    </div>
  )
}

/** AddDomainModal 添加受管域名:固定尺寸弹窗,单字段域名输入。 */
function AddDomainModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const canSubmit = name.trim().length > 0 && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const d = await apiFetch<Domain>('/api/m/dns/domains', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      })
      onCreated(d.id)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="添加域名" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="域名"
          placeholder="例如 example.com"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          className="font-[family-name:var(--font-mono)]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        {err && (
          <p className="rounded-(--radius-sm) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            添加
          </Button>
        </div>
      </div>
    </Modal>
  )
}
