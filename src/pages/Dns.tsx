import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Input } from '../components/Input'
import { Spinner } from '../components/Spinner'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import {
  Plus,
  Settings2,
  RefreshCw,
  Search,
  Globe,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { IconButton } from '../components/IconButton'
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

const PAGE_SIZES = [10, 20, 50] as const

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
  const [query, setQuery] = useState('')

  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

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

  const visible = useMemo(() => {
    if (selected === null) return []
    const q = query.trim().toLowerCase()
    if (!q) return records
    return records.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.value.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q),
    )
  }, [records, selected, query])

  // 切换域名/搜索/每页条数或行数缩减时,把当前页夹回有效范围,避免停在空页。
  const total = visible.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  useEffect(() => {
    setPage(0)
  }, [selected])
  const pageRows = useMemo(
    () => visible.slice(page * pageSize, page * pageSize + pageSize),
    [visible, page, pageSize],
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
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索主机记录、类型或记录值"
                spellCheck={false}
                className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              />
            </div>
            <Button
              variant="ghost"
              size="md"
              onClick={() => void loadRecords(selected)}
              disabled={recordsLoading}
            >
              <RefreshCw size={15} className={recordsLoading ? 'animate-spin' : ''} />
              刷新
            </Button>
          </div>
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
        <>
          <Table
            columns={columns}
            rows={pageRows}
            rowKey={(r) => r.id}
            emptyText={
              <EmptyState
                icon={<Globe />}
                title={
                  domains.length === 0
                    ? '还没有域名'
                    : query.trim() && records.length > 0
                      ? '没有匹配的记录'
                      : '该域名暂无解析记录'
                }
                hint={
                  domains.length === 0
                    ? '点击「添加域名」开始管理你的 DNS。'
                    : query.trim() && records.length > 0
                      ? '换个关键词试试。'
                      : isAdmin
                        ? '点击「添加记录」创建第一条解析。'
                        : '记录的写操作需要 admin 角色。'
                }
              />
            }
          />
          {total > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
              <span className="tabular-nums">共 {total} 条</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(0)
                }}
                aria-label="每页条数"
                className="h-8 rounded-(--radius-sm) border border-border bg-surface-2 px-2 text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} 条/页
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <IconButton
                  aria-label="上一页"
                  className="h-8 w-8"
                  disabled={page === 0}
                  icon={<ChevronLeft size={16} />}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                />
                <span className="tabular-nums px-1">
                  {page + 1} / {pageCount}
                </span>
                <IconButton
                  aria-label="下一页"
                  className="h-8 w-8"
                  disabled={page >= pageCount - 1}
                  icon={<ChevronRight size={16} />}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                />
              </div>
            </div>
          )}
        </>
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
