import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/Button'
import { Table, ActionLink, ActionLinks, type Column } from '../../components/Table'
import { Plus, UserPlus, ArrowLeftRight, Search, Database as DatabaseIcon, User } from 'lucide-react'
import { type Engine, type DbInfo, type DbUser, DANGER, errorText } from './shared'
import { CreateDbModal, CreateUserModal, GrantModal, PasswordModal, TransferModal } from './modals'

type Modal =
  | { kind: 'create-db' }
  | { kind: 'create-user' }
  | { kind: 'transfer' }
  | { kind: 'grant'; user: DbUser }
  | { kind: 'password'; user: DbUser }
  | null

/** SqlEnginePanel MySQL / PostgreSQL 面板:库列表与用户列表(紧凑 Table)+ 工具栏 + 弹窗操作。 */
export function SqlEnginePanel({
  engine,
  refreshKey,
  onBackupDone,
}: {
  engine: Engine
  refreshKey: number
  onBackupDone: () => void
}) {
  const base = `/api/m/database/${engine}`
  const [databases, setDatabases] = useState<DbInfo[]>([])
  const [users, setUsers] = useState<DbUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<Modal>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    setLoading(true)
    try {
      const [dbs, us] = await Promise.all([
        apiFetch<DbInfo[]>(`${base}/databases`),
        apiFetch<DbUser[]>(`${base}/users`),
      ])
      setDatabases(Array.isArray(dbs) ? dbs : [])
      setUsers(Array.isArray(us) ? us : [])
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true)
    setFeedback(null)
    try {
      await fn()
      setFeedback({ kind: 'ok', text: `${label}成功` })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function dropDb(name: string) {
    if (!window.confirm(`确认删除数据库「${name}」?此操作不可恢复。`)) return
    void run('删除数据库', () =>
      apiFetch(`${base}/databases`, { method: 'DELETE', headers: DANGER, body: JSON.stringify({ database: name }) }),
    )
  }

  function backupDb(name: string) {
    void run('备份数据库', async () => {
      await apiFetch(`${base}/databases/${encodeURIComponent(name)}/backup`, { method: 'POST' })
      onBackupDone()
    })
  }

  function dropUser(user: string) {
    if (!window.confirm(`确认删除用户「${user}」?此操作不可恢复。`)) return
    void run('删除用户', () =>
      apiFetch(`${base}/users`, { method: 'DELETE', headers: DANGER, body: JSON.stringify({ user }) }),
    )
  }

  function afterModalChange(label: string) {
    setModal(null)
    setFeedback({ kind: 'ok', text: `${label}成功` })
    void load()
  }

  const q = query.trim().toLowerCase()
  const visibleDbs = useMemo(
    () => (q ? databases.filter((d) => d.name.toLowerCase().includes(q)) : databases),
    [databases, q],
  )
  const visibleUsers = useMemo(
    () => (q ? users.filter((u) => u.user.toLowerCase().includes(q) || u.host.toLowerCase().includes(q)) : users),
    [users, q],
  )

  const dbColumns: Column<DbInfo>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '库名',
        cell: (d) => (
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <DatabaseIcon size={15} className="shrink-0 text-muted" />
            <span className="truncate font-[family-name:var(--font-mono)]">{d.name}</span>
          </span>
        ),
      },
      {
        key: 'charset',
        header: '字符集',
        width: '180px',
        cell: (d) => (
          <span className="truncate text-xs text-muted">
            {d.charset || '—'}
            {d.collation ? ` · ${d.collation}` : ''}
          </span>
        ),
      },
      {
        key: 'size',
        header: '大小',
        width: '100px',
        align: 'right',
        cell: (d) => <span className="text-muted">{d.size_mb} MB</span>,
      },
      {
        key: 'tables',
        header: '表数',
        width: '80px',
        align: 'right',
        cell: (d) => <span className="text-muted">{d.tables}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '150px',
        align: 'right',
        cell: (d) => (
          <ActionLinks>
            <ActionLink onClick={() => setModal({ kind: 'transfer' })} disabled={busy}>
              管理
            </ActionLink>
            <ActionLink onClick={() => backupDb(d.name)} disabled={busy}>
              备份
            </ActionLink>
            <ActionLink danger onClick={() => dropDb(d.name)} disabled={busy} aria-label="删除数据库">
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [busy],
  )

  const userColumns: Column<DbUser>[] = useMemo(
    () => [
      {
        key: 'user',
        header: '用户',
        cell: (u) => (
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <User size={15} className="shrink-0 text-muted" />
            <span className="truncate font-[family-name:var(--font-mono)]">{u.user}</span>
          </span>
        ),
      },
      {
        key: 'host',
        header: '主机',
        width: '180px',
        cell: (u) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{u.host || '%'}</span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '170px',
        align: 'right',
        cell: (u) => (
          <ActionLinks>
            <ActionLink onClick={() => setModal({ kind: 'password', user: u })} disabled={busy}>
              改密
            </ActionLink>
            <ActionLink onClick={() => setModal({ kind: 'grant', user: u })} disabled={busy}>
              授权
            </ActionLink>
            <ActionLink danger onClick={() => dropUser(u.user)} disabled={busy} aria-label="删除用户">
              删除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [busy],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="md" onClick={() => setModal({ kind: 'create-db' })} disabled={busy}>
            <Plus size={15} />
            新建库
          </Button>
          <Button size="md" variant="ghost" onClick={() => setModal({ kind: 'create-user' })} disabled={busy}>
            <UserPlus size={15} />
            新建用户
          </Button>
          <Button size="md" variant="ghost" onClick={() => setModal({ kind: 'transfer' })} disabled={busy}>
            <ArrowLeftRight size={15} />
            导入导出
          </Button>
        </div>
        <div className="relative w-56">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索库名或用户"
            spellCheck={false}
            className="h-10 w-full rounded-(--radius-sm) border border-border bg-surface-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>
      </div>

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{feedback.text}</p>
      )}
      {loadErr && databases.length === 0 && !loading && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-text">数据库</h3>
        {loading ? (
          <div className="h-40 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
        ) : (
          <Table
            columns={dbColumns}
            rows={visibleDbs}
            rowKey={(d) => d.name}
            emptyText={
              <span className="flex flex-col items-center gap-1 py-6">
                <span className="text-sm font-medium text-text">
                  {databases.length === 0 ? '还没有数据库' : '没有匹配的数据库'}
                </span>
                <span className="text-xs text-muted">
                  {databases.length === 0 ? '点击「新建库」创建第一个数据库。' : '换个关键词试试。'}
                </span>
              </span>
            }
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-text">用户</h3>
        {loading ? (
          <div className="h-28 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
        ) : (
          <Table
            columns={userColumns}
            rows={visibleUsers}
            rowKey={(u) => `${u.user}@${u.host}`}
            emptyText={
              <span className="flex flex-col items-center gap-1 py-6">
                <span className="text-sm font-medium text-text">
                  {users.length === 0 ? '还没有用户' : '没有匹配的用户'}
                </span>
                <span className="text-xs text-muted">
                  {users.length === 0 ? '点击「新建用户」创建数据库账号。' : '换个关键词试试。'}
                </span>
              </span>
            }
          />
        )}
      </div>

      {modal?.kind === 'create-db' && (
        <CreateDbModal engine={engine} onClose={() => setModal(null)} onCreated={() => afterModalChange('创建数据库')} />
      )}
      {modal?.kind === 'create-user' && (
        <CreateUserModal engine={engine} onClose={() => setModal(null)} onCreated={() => afterModalChange('创建用户')} />
      )}
      {modal?.kind === 'grant' && (
        <GrantModal
          engine={engine}
          user={modal.user}
          databases={databases}
          onClose={() => setModal(null)}
          onDone={() => void load()}
        />
      )}
      {modal?.kind === 'password' && (
        <PasswordModal
          engine={engine}
          user={modal.user}
          onClose={() => setModal(null)}
          onDone={() => afterModalChange('修改密码')}
        />
      )}
      {modal?.kind === 'transfer' && (
        <TransferModal
          engine={engine}
          databases={databases}
          onClose={() => setModal(null)}
          onDone={() => void load()}
        />
      )}
    </div>
  )
}
