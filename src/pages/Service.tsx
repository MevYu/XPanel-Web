import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Search, ServerCog } from 'lucide-react'
import { uid } from '../lib/uid'

// 危险操作(停止服务)请求头,与各页约定一致;后端 admin 校验为权威。
const DANGER = { 'X-Confirm-Danger': '1' }

// 与后端同款单元名校验,前端先挡掉非法输入避免无谓请求。
const UNIT_RE = /^[a-zA-Z0-9._@-]{1,128}$/

type Verb = 'start' | 'stop' | 'restart'

interface ServiceItem {
  name: string
  description: string
  active: string // active / failed / inactive 等 systemd ActiveState
  sub: string // running / dead / exited 等 SUB 细分
  enabled: string // enabled / disabled / static 等;无 unit-file 条目时为空
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

// status 端点返回 text/plain(systemctl 原文),不能走强制 JSON 的 apiFetch,用裸 fetch 自带 Bearer。
async function fetchStatus(unit: string): Promise<string> {
  const t = tokenStore.get()
  const headers: Record<string, string> = t ? { Authorization: `Bearer ${t.access}` } : {}
  const res = await fetch(`/api/m/service/status?unit=${encodeURIComponent(unit)}`, { headers })
  const body = await res.text()
  if (!res.ok) throw new Error(body || '状态获取失败')
  return body
}

function statusBadge(s: ServiceItem) {
  if (s.active === 'active') return <Badge status="online">运行中</Badge>
  if (s.active === 'failed') return <Badge status="crit">失败</Badge>
  if (s.active === 'activating' || s.active === 'deactivating')
    return <Badge status="warn">{s.sub || s.active}</Badge>
  return <Badge status="neutral">{s.active || '已停止'}</Badge>
}

const verbLabel: Record<Verb, string> = { start: '启动', stop: '停止', restart: '重启' }

/** Service 服务管理:aaPanel 风格统一服务表,按行 start/stop/restart/查状态(写操作需 operator,停止额外需 admin+确认)。 */
export default function Service() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [services, setServices] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [busyUnit, setBusyUnit] = useState<string | null>(null)
  const [output, setOutput] = useState<{ unit: string; text: string } | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return services
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    )
  }, [services, query])

  const queryStatus = useCallback(async (unit: string) => {
    setBusyUnit(unit)
    setFeedback(null)
    try {
      setOutput({ unit, text: await fetchStatus(unit) })
    } catch (e) {
      setOutput(null)
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusyUnit(null)
    }
  }, [])

  const act = useCallback(
    async (unit: string, verb: Verb) => {
      if (!canWrite) return
      // 停止为危险操作:需 admin + 确认 + 危险头(与后端权威校验对齐)。
      const danger = verb === 'stop'
      if (danger) {
        if (!isAdmin) return
        if (!window.confirm(`确认停止服务「${unit}」?此操作危险。`)) return
      }
      setBusyUnit(unit)
      setFeedback(null)
      try {
        await apiFetch(`/api/m/service/${verb}?unit=${encodeURIComponent(unit)}`, {
          method: 'POST',
          ...(danger ? { headers: DANGER } : {}),
        })
        setFeedback({ kind: 'ok', text: `已对 ${unit} 执行${verbLabel[verb]}` })
        await load()
      } catch (e) {
        setFeedback({ kind: 'err', text: errorText(e) })
      } finally {
        setBusyUnit(null)
      }
    },
    [canWrite, isAdmin, load],
  )

  const columns: Column<ServiceItem>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '服务名',
        cell: (s) => (
          <button
            type="button"
            onClick={() => void queryStatus(s.name)}
            title="查看状态详情"
            className="inline-flex max-w-full items-center gap-2 rounded-sm text-left outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <ServerCog size={15} className="shrink-0 text-warn" />
            <span className="truncate font-[family-name:var(--font-mono)] text-text">
              {s.name}
            </span>
          </button>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '96px',
        cell: (s) => statusBadge(s),
      },
      {
        key: 'desc',
        header: '描述',
        cell: (s) => <span className="truncate text-muted">{s.description || '—'}</span>,
      },
      {
        key: 'enabled',
        header: '开机自启',
        width: '96px',
        cell: (s) =>
          s.enabled === 'enabled' ? (
            <span className="text-online">已启用</span>
          ) : s.enabled === 'static' ? (
            <span className="text-muted">static</span>
          ) : (
            <span className="text-muted">{s.enabled || '—'}</span>
          ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '170px',
        align: 'right',
        cell: (s) => {
          const busy = busyUnit === s.name
          return (
            <span className="inline-flex items-center justify-end gap-2">
              {busy && <Spinner size={14} />}
              <ActionLinks>
                <ActionLink
                  disabled={busy || !canWrite}
                  title={canWrite ? '启动' : '需要 operator 角色'}
                  onClick={() => void act(s.name, 'start')}
                >
                  启动
                </ActionLink>
                <ActionLink
                  danger
                  disabled={busy || !isAdmin}
                  title={isAdmin ? '停止(危险)' : '需要 admin 角色'}
                  onClick={() => void act(s.name, 'stop')}
                >
                  停止
                </ActionLink>
                <ActionLink
                  disabled={busy || !canWrite}
                  title={canWrite ? '重启' : '需要 operator 角色'}
                  onClick={() => void act(s.name, 'restart')}
                >
                  重启
                </ActionLink>
              </ActionLinks>
            </span>
          )
        },
      },
    ],
    [busyUnit, canWrite, isAdmin, act, queryStatus],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-64">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索服务名或描述"
            aria-label="搜索"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
        <Button variant="ghost" size="md" onClick={() => void load()} disabled={loading}>
          刷新
        </Button>
      </div>

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      {loadErr && services.length === 0 && !loading && (
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
          rows={visible}
          rowKey={(s) => s.name}
          emptyText={
            <span className="flex flex-col items-center gap-1 py-6">
              <span className="text-sm font-medium text-text">
                {services.length === 0 ? '暂无服务' : '没有匹配的服务'}
              </span>
              <span className="text-xs text-muted">
                {services.length === 0
                  ? 'systemctl 未返回任何服务,或当前环境不支持。'
                  : '换个关键词试试。'}
              </span>
            </span>
          }
        />
      )}

      {!canWrite && (
        <p className="text-xs text-muted">启动 / 重启需要 operator 角色,停止需要 admin。</p>
      )}

      <ManualPanel canWrite={canWrite} isAdmin={isAdmin} onActed={() => void load()} />

      {output !== null && (
        <Modal title={output.unit} size="lg" onClose={() => setOutput(null)}>
          <pre className="overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
            {output.text}
          </pre>
        </Modal>
      )}
    </div>
  )
}

/** ManualPanel 按名手动管理:列表外的次要入口(覆盖未列出的单元),默认折叠。 */
function ManualPanel({
  canWrite,
  isAdmin,
  onActed,
}: {
  canWrite: boolean
  isAdmin: boolean
  onActed: () => void
}) {
  const [open, setOpen] = useState(false)
  const [unit, setUnit] = useState('')
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const trimmed = unit.trim()
  const invalid = trimmed.length > 0 && !UNIT_RE.test(trimmed)
  const canAct = trimmed.length > 0 && !invalid && !busy

  // 关联 input 与错误文案,便于无障碍读屏。
  const errId = useMemo(() => uid(), [])

  async function queryStatus() {
    if (!canAct) return
    setBusy(true)
    setFeedback(null)
    try {
      setOutput(await fetchStatus(trimmed))
    } catch (e) {
      setOutput(null)
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function act(verb: Verb) {
    if (!canAct || !canWrite) return
    const danger = verb === 'stop'
    if (danger) {
      if (!isAdmin) return
      if (!window.confirm(`确认停止服务「${trimmed}」?此操作危险。`)) return
    }
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/service/${verb}?unit=${encodeURIComponent(trimmed)}`, {
        method: 'POST',
        ...(danger ? { headers: DANGER } : {}),
      })
      setFeedback({ kind: 'ok', text: `已对 ${trimmed} 执行${verbLabel[verb]}` })
      onActed()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-(--radius-card) border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-text outline-none transition hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <span>按名手动管理</span>
        <span className="text-xs text-muted">{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
          <div className="flex flex-col gap-1">
            <input
              value={unit}
              placeholder="服务单元,例如 nginx、ssh"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errId : undefined}
              onChange={(e) => setUnit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void queryStatus()
              }}
              className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            />
            {invalid && (
              <p id={errId} className="text-xs text-crit">
                单元名仅允许字母、数字与 . _ @ - ,长度 1–128
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => void queryStatus()} disabled={!canAct}>
              查询状态
            </Button>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <Button
              variant="ghost"
              onClick={() => void act('start')}
              disabled={!canAct || !canWrite}
              title={canWrite ? '启动' : '需要 operator 角色'}
            >
              启动
            </Button>
            <Button
              onClick={() => void act('restart')}
              disabled={!canAct || !canWrite}
              title={canWrite ? '重启' : '需要 operator 角色'}
            >
              重启
            </Button>
            <Button
              variant="danger"
              onClick={() => void act('stop')}
              disabled={!canAct || !isAdmin}
              title={isAdmin ? '停止(危险)' : '需要 admin 角色'}
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
        </div>
      )}
    </div>
  )
}
