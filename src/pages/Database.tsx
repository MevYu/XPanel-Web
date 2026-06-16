import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch, tokenStore } from '../api/client'
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

// 文本端点(redis info)走原始 fetch:apiFetch 会强制 JSON.parse,纯文本响应会抛错。
async function fetchText(path: string): Promise<string> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

// 下载走裸 fetch 取 blob:apiFetch 会强制 JSON.parse,二进制响应会抛错。
async function downloadBlob(path: string, filename: string): Promise<void> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

interface Backup {
  id: string
  engine: string
  db_name: string
  filename: string
  size: number
  created_at: string
}

interface Settings {
  mysql_host: string
  mysql_port: number
  mysql_socket: string
  mysql_user: string
  mysql_password: string
  mysql_data_dir: string
  pg_host: string
  pg_port: number
  pg_user: string
  pg_password: string
  pg_data_dir: string
  redis_host: string
  redis_port: number
  redis_password: string
  backup_dir: string
}

interface SettingsResponse {
  settings: Settings
  passwords_set: string[]
}

type Engine = 'mysql' | 'postgres'

interface DbInfo {
  name: string
  size_mb: string
  tables: number
  charset: string
  collation: string
}

interface DbUser {
  user: string
  host: string
}

function SettingsCard({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<Settings | null>(null)
  const [passSet, setPassSet] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<SettingsResponse>('/api/m/database/settings')
      setForm(data.settings)
      setPassSet(data.passwords_set ?? [])
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!form) return
    setBusy(true)
    setFeedback(null)
    try {
      const data = await apiFetch<SettingsResponse>('/api/m/database/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      setForm(data.settings)
      setPassSet(data.passwords_set ?? [])
      setFeedback({ kind: 'ok', text: '设置已保存' })
      onSaved()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function num(v: string): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  if (loading || !form) {
    return (
      <Card className="flex h-32 items-center justify-center">
        <Spinner size={24} />
      </Card>
    )
  }

  const passHint = (key: string) =>
    passSet.includes(key) ? '已设置,留空保留原值' : '未设置'

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">连接设置</h2>

      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">MySQL / MariaDB</span>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="主机" value={form.mysql_host} spellCheck={false}
            onChange={(e) => setForm({ ...form, mysql_host: e.target.value })} />
          <Input label="端口" inputMode="numeric" value={String(form.mysql_port)}
            onChange={(e) => setForm({ ...form, mysql_port: num(e.target.value) })} />
          <Input label="Socket(可选)" value={form.mysql_socket} spellCheck={false}
            onChange={(e) => setForm({ ...form, mysql_socket: e.target.value })} />
          <Input label="用户" value={form.mysql_user} spellCheck={false}
            onChange={(e) => setForm({ ...form, mysql_user: e.target.value })} />
          <Input label={`密码(${passHint('mysql')})`} type="password" value={form.mysql_password}
            placeholder="••••••" onChange={(e) => setForm({ ...form, mysql_password: e.target.value })} />
          <Input label="数据目录" value={form.mysql_data_dir} spellCheck={false}
            onChange={(e) => setForm({ ...form, mysql_data_dir: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">PostgreSQL</span>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="主机" value={form.pg_host} spellCheck={false}
            onChange={(e) => setForm({ ...form, pg_host: e.target.value })} />
          <Input label="端口" inputMode="numeric" value={String(form.pg_port)}
            onChange={(e) => setForm({ ...form, pg_port: num(e.target.value) })} />
          <Input label="用户" value={form.pg_user} spellCheck={false}
            onChange={(e) => setForm({ ...form, pg_user: e.target.value })} />
          <Input label={`密码(${passHint('pg')})`} type="password" value={form.pg_password}
            placeholder="••••••" onChange={(e) => setForm({ ...form, pg_password: e.target.value })} />
          <Input label="数据目录" value={form.pg_data_dir} spellCheck={false}
            onChange={(e) => setForm({ ...form, pg_data_dir: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Redis</span>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="主机" value={form.redis_host} spellCheck={false}
            onChange={(e) => setForm({ ...form, redis_host: e.target.value })} />
          <Input label="端口" inputMode="numeric" value={String(form.redis_port)}
            onChange={(e) => setForm({ ...form, redis_port: num(e.target.value) })} />
          <Input label={`密码(${passHint('redis')})`} type="password" value={form.redis_password}
            placeholder="••••••" onChange={(e) => setForm({ ...form, redis_password: e.target.value })} />
        </div>
      </div>

      <Input label="备份目录" value={form.backup_dir} spellCheck={false}
        onChange={(e) => setForm({ ...form, backup_dir: e.target.value })} />

      <div className="flex items-center gap-2">
        <Button onClick={() => void save()} disabled={busy}>保存设置</Button>
        {busy && <Spinner size={16} />}
      </div>
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function ListBox<T>({
  loading, error, items, empty, render,
}: {
  loading: boolean
  error: string | null
  items: T[]
  empty: string
  render: (item: T) => ReactNode
}) {
  return (
    <div className="rounded-(--radius-card) border border-border">
      {loading ? (
        <div className="flex h-24 items-center justify-center"><Spinner size={20} /></div>
      ) : error ? (
        <p className="p-4 text-sm text-muted">{error}</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-muted">{empty}</p>
      ) : (
        <div className="max-h-72 divide-y divide-border overflow-auto">{items.map(render)}</div>
      )}
    </div>
  )
}

function SqlEnginePanel({
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

  const [newDb, setNewDb] = useState('')
  const [newUser, setNewUser] = useState('')
  const [newUserPass, setNewUserPass] = useState('')
  const [grantDb, setGrantDb] = useState('')
  const [grantUser, setGrantUser] = useState('')
  const [pwUser, setPwUser] = useState('')
  const [pwPass, setPwPass] = useState('')

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

  function post(path: string, body: unknown) {
    return apiFetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(body) })
  }

  function createDb() {
    const name = newDb.trim()
    if (!name) return
    void run('创建数据库', async () => {
      await post('/databases', { database: name })
      setNewDb('')
    })
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

  function createUser() {
    const user = newUser.trim()
    if (!user || !newUserPass) return
    void run('创建用户', async () => {
      await post('/users', { user, password: newUserPass })
      setNewUser('')
      setNewUserPass('')
    })
  }

  function dropUser(user: string) {
    if (!window.confirm(`确认删除用户「${user}」?此操作不可恢复。`)) return
    void run('删除用户', () =>
      apiFetch(`${base}/users`, { method: 'DELETE', headers: DANGER, body: JSON.stringify({ user }) }),
    )
  }

  function grant() {
    const database = grantDb.trim()
    const user = grantUser.trim()
    if (!database || !user) return
    void run('授权', async () => {
      await post('/grant', { database, user })
    })
  }

  function revoke() {
    const database = grantDb.trim()
    const user = grantUser.trim()
    if (!database || !user) return
    void run('回收授权', async () => {
      await post('/revoke', { database, user })
    })
  }

  function setPassword() {
    const user = pwUser.trim()
    if (!user || !pwPass) return
    void run('改密', async () => {
      await post('/users/password', { user, password: pwPass })
      setPwPass('')
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text">数据库</h3>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>刷新</Button>
          </div>
          <div className="flex items-end gap-2">
            <Input label="新建数据库" className="flex-1" value={newDb} spellCheck={false}
              placeholder="名称" onChange={(e) => setNewDb(e.target.value)} />
            <Button onClick={createDb} disabled={busy || !newDb.trim()}>创建</Button>
          </div>
          <ListBox loading={loading} error={loadErr} items={databases}
            empty="暂无数据库"
            render={(db) => (
              <div key={db.name} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="truncate font-[family-name:var(--font-mono)] text-sm text-text">{db.name}</span>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {db.size_mb} MB · {db.tables} 表{db.charset ? ` · ${db.charset}` : ''}{db.collation ? ` · ${db.collation}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => backupDb(db.name)} disabled={busy}>备份</Button>
                  <Button size="sm" variant="danger" onClick={() => dropDb(db.name)} disabled={busy}>删除</Button>
                </div>
              </div>
            )} />
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="text-sm font-medium text-text">用户</h3>
          <div className="flex flex-wrap items-end gap-2">
            <Input label="新建用户" className="flex-1" value={newUser} spellCheck={false}
              placeholder="用户名" onChange={(e) => setNewUser(e.target.value)} />
            <Input label="密码" type="password" className="flex-1" value={newUserPass}
              onChange={(e) => setNewUserPass(e.target.value)} />
            <Button onClick={createUser} disabled={busy || !newUser.trim() || !newUserPass}>创建</Button>
          </div>
          <ListBox loading={loading} error={loadErr} items={users}
            empty="暂无用户"
            render={(u) => (
              <div key={`${u.user}@${u.host}`} className="flex items-center justify-between px-4 py-2.5">
                <span className="truncate font-[family-name:var(--font-mono)] text-sm text-text">
                  {u.user}{u.host ? `@${u.host}` : ''}
                </span>
                <Button size="sm" variant="danger" onClick={() => dropUser(u.user)} disabled={busy}>删除</Button>
              </div>
            )} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <h3 className="text-sm font-medium text-text">授权 / 回收</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="数据库" value={grantDb} spellCheck={false}
              onChange={(e) => setGrantDb(e.target.value)} />
            <Input label="用户" value={grantUser} spellCheck={false}
              onChange={(e) => setGrantUser(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={grant} disabled={busy || !grantDb.trim() || !grantUser.trim()}>授权全部</Button>
            <Button variant="ghost" onClick={revoke} disabled={busy || !grantDb.trim() || !grantUser.trim()}>回收</Button>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="text-sm font-medium text-text">修改密码</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="用户" value={pwUser} spellCheck={false}
              onChange={(e) => setPwUser(e.target.value)} />
            <Input label="新密码" type="password" value={pwPass}
              onChange={(e) => setPwPass(e.target.value)} />
          </div>
          <Button onClick={setPassword} disabled={busy || !pwUser.trim() || !pwPass}>修改密码</Button>
        </Card>
      </div>
    </div>
  )
}

function RedisPanel() {
  const [info, setInfo] = useState<string | null>(null)
  const [dbsize, setDbsize] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<string, string> | null>(null)
  const [config, setConfig] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const [i, s, d, c] = await Promise.all([
        fetchText('/api/m/database/redis/info'),
        apiFetch<{ dbsize: number }>('/api/m/database/redis/dbsize'),
        apiFetch<{ details: Record<string, string> }>('/api/m/database/redis/details'),
        apiFetch<{ config: Record<string, string> }>('/api/m/database/redis/config'),
      ])
      setInfo(i)
      setDbsize(s.dbsize)
      setDetails(d.details ?? {})
      setConfig(c.config ?? {})
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  async function flush() {
    if (!window.confirm('确认清空当前 Redis 数据库?此操作不可恢复。')) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/database/redis/flushdb', { method: 'POST', headers: DANGER })
      setFeedback({ kind: 'ok', text: '已清空当前库' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-text">Redis</h3>
        <div className="flex items-center gap-2">
          {dbsize !== null && <Badge status="neutral">{dbsize} keys</Badge>}
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>查询 info</Button>
          <Button size="sm" variant="danger" onClick={() => void flush()} disabled={busy}>flushdb</Button>
        </div>
      </div>
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
      {loading ? (
        <div className="flex h-24 items-center justify-center"><Spinner size={20} /></div>
      ) : info !== null ? (
        <div className="flex flex-col gap-4">
          {details && Object.keys(details).length > 0 && (
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(details).map(([k, v]) => (
                <div key={k} className="flex flex-col rounded-(--radius-card) bg-surface-2 px-3 py-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="truncate font-[family-name:var(--font-mono)] text-sm text-text">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {config && Object.keys(config).length > 0 && (
            <div className="rounded-(--radius-card) border border-border">
              <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">配置</div>
              <dl className="divide-y divide-border">
                {Object.entries(config).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-2">
                    <dt className="font-[family-name:var(--font-mono)] text-xs text-muted">{k}</dt>
                    <dd className="truncate font-[family-name:var(--font-mono)] text-sm text-text">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <pre className="max-h-96 overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
            {info.trim() || '无输出'}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-muted">点击「查询 info」加载 Redis 信息。</p>
      )}
    </Card>
  )
}

function BackupsPanel({ refreshKey }: { refreshKey: number }) {
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    setLoading(true)
    try {
      const data = await apiFetch<Backup[]>('/api/m/database/backups')
      setBackups(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

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

  function restore(b: Backup) {
    if (!window.confirm(`确认用备份「${b.filename}」恢复数据库「${b.db_name}」?现有数据将被覆盖,不可恢复。`)) return
    void run('恢复', () =>
      apiFetch(`/api/m/database/backups/${encodeURIComponent(b.id)}/restore`, {
        method: 'POST',
        headers: DANGER,
      }),
    )
  }

  function remove(b: Backup) {
    if (!window.confirm(`确认删除备份「${b.filename}」?此操作不可恢复。`)) return
    void run('删除备份', () =>
      apiFetch(`/api/m/database/backups/${encodeURIComponent(b.id)}`, {
        method: 'DELETE',
        headers: DANGER,
      }),
    )
  }

  async function download(b: Backup) {
    setFeedback(null)
    try {
      await downloadBlob(`/api/m/database/backups/${encodeURIComponent(b.id)}/download`, b.filename)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">备份记录</h3>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>刷新</Button>
      </div>

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      <div className="rounded-(--radius-card) border border-border">
        {loading ? (
          <div className="flex h-24 items-center justify-center"><Spinner size={20} /></div>
        ) : loadErr ? (
          <p className="p-4 text-sm text-crit">{loadErr}</p>
        ) : backups.length === 0 ? (
          <p className="p-4 text-sm text-muted">暂无备份。在 MySQL / PostgreSQL 标签的库列表中点击「备份」即可创建。</p>
        ) : (
          <div className="max-h-96 divide-y divide-border overflow-auto">
            {backups.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge status="neutral">{b.engine}</Badge>
                    <span className="truncate font-[family-name:var(--font-mono)] text-sm text-text">{b.db_name}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {b.filename} · {formatSize(b.size)} · {formatDate(b.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => void download(b)}>下载</Button>
                  <Button size="sm" onClick={() => restore(b)} disabled={busy}>恢复</Button>
                  <Button size="sm" variant="danger" onClick={() => remove(b)} disabled={busy}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

type Tab = 'mysql' | 'postgres' | 'redis' | 'backups' | 'settings'

const TABS: { key: Tab; label: string }[] = [
  { key: 'mysql', label: 'MySQL' },
  { key: 'postgres', label: 'PostgreSQL' },
  { key: 'redis', label: 'Redis' },
  { key: 'backups', label: '备份记录' },
  { key: 'settings', label: '连接设置' },
]

/** Database 数据库:连接设置,MySQL/PostgreSQL 库与用户管理、授权改密、库级备份与恢复,Redis info 与清库。 */
export default function Database() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const [tab, setTab] = useState<Tab>('mysql')
  const [refreshKey, setRefreshKey] = useState(0)
  const [backupsKey, setBackupsKey] = useState(0)

  if (!isAdmin) {
    return (
      <Card>
        <p className="text-sm text-muted">数据库管理需要 admin 角色。</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1 rounded-(--radius-card) border border-border bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`h-8 rounded-(--radius-card) px-3 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
              tab === t.key ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mysql' && (
        <SqlEnginePanel engine="mysql" refreshKey={refreshKey} onBackupDone={() => setBackupsKey((k) => k + 1)} />
      )}
      {tab === 'postgres' && (
        <SqlEnginePanel engine="postgres" refreshKey={refreshKey} onBackupDone={() => setBackupsKey((k) => k + 1)} />
      )}
      {tab === 'redis' && <RedisPanel />}
      {tab === 'backups' && <BackupsPanel refreshKey={backupsKey} />}
      {tab === 'settings' && <SettingsCard onSaved={() => setRefreshKey((k) => k + 1)} />}
    </div>
  )
}
