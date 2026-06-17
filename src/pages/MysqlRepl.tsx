import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { Settings2, UserPlus, GitBranch, RefreshCw, Database, Server } from 'lucide-react'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

const DANGER = { 'X-Confirm-Danger': '1' }

interface Settings {
  master_host: string
  master_port: number
  master_user: string
  master_password: string
  slave_host: string
  slave_port: number
  slave_user: string
  slave_password: string
}

interface SettingsResponse {
  settings: Settings
  passwords_set: string[]
}

interface MasterStatus {
  file: string
  position: number
}

interface SlaveStatus {
  io_running: string
  sql_running: string
  seconds_behind: number | null
  master_host: string
  master_log_file: string
  last_io_error: string
  last_sql_error: string
  healthy: boolean
}

type Dialog = 'settings' | 'repl-user' | 'configure' | null

function runBadge(v: string): 'online' | 'warn' | 'crit' {
  return v === 'Yes' ? 'online' : v === 'Connecting' ? 'warn' : 'crit'
}

/** 状态总览卡:暖色图标 + 角色标题 + 一组状态/数值行。 */
function StatusCard({
  icon,
  title,
  role,
  onRefresh,
  busy,
  children,
}: {
  icon: ReactNode
  title: string
  role: string
  onRefresh: () => void
  busy: boolean
  children: ReactNode
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-(--radius-sm) bg-warn-soft text-warn">
            {icon}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text">{title}</span>
            <span className="text-xs text-muted">{role}</span>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onRefresh} disabled={busy}>
          <RefreshCw size={14} />
          查询
        </Button>
      </div>
      {children}
    </Card>
  )
}

interface SlaveRow {
  id: string
  label: string
  value: ReactNode
}

/** MySQL 主从:状态总览卡 + 从库线程紧凑表 + 固定尺寸 Modal 表单(连接设置/建复制用户/搭建从库)。 */
export default function MysqlRepl() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [settings, setSettings] = useState<Settings | null>(null)
  const [passwordsSet, setPasswordsSet] = useState<string[]>([])
  const [master, setMaster] = useState<MasterStatus | null>(null)
  const [slave, setSlave] = useState<SlaveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const s = await apiFetch<SettingsResponse>('/api/m/mysqlrepl/settings')
      setSettings(s.settings)
      setPasswordsSet(s.passwords_set ?? [])
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function call(fn: () => Promise<void>, ok: string): Promise<boolean> {
    if (busy || !isAdmin) return false
    setBusy(true)
    setFeedback(null)
    try {
      await fn()
      setFeedback({ kind: 'ok', text: ok })
      return true
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
      return false
    } finally {
      setBusy(false)
    }
  }

  const loadMaster = () =>
    call(async () => {
      setMaster(await apiFetch<MasterStatus>('/api/m/mysqlrepl/master/status'))
    }, '主库状态已刷新')

  const loadSlave = () =>
    call(async () => {
      setSlave(await apiFetch<SlaveStatus>('/api/m/mysqlrepl/slave/status'))
    }, '从库状态已刷新')

  const startSlave = () =>
    call(async () => {
      await apiFetch('/api/m/mysqlrepl/slave/start', { method: 'POST' })
      setSlave(await apiFetch<SlaveStatus>('/api/m/mysqlrepl/slave/status').catch(() => slave))
    }, '从库复制已启动')

  const stopSlave = () => {
    if (!window.confirm('确认停止从库复制(stop slave)?此操作危险。')) return
    void call(async () => {
      await apiFetch('/api/m/mysqlrepl/slave/stop', { method: 'POST', headers: DANGER })
      setSlave(await apiFetch<SlaveStatus>('/api/m/mysqlrepl/slave/status').catch(() => slave))
    }, '从库复制已停止')
  }

  const resetSlave = () => {
    if (!window.confirm('确认重置从库复制(reset slave)?将清除复制配置,危险且不可恢复。')) return
    void call(async () => {
      await apiFetch('/api/m/mysqlrepl/slave/reset', { method: 'POST', headers: DANGER })
      setSlave(null)
    }, '从库复制已重置')
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  if (!isAdmin) {
    return <p className="text-sm text-muted">MySQL 主从管理需要 admin 角色。</p>
  }

  const slaveRows: SlaveRow[] = slave
    ? [
        {
          id: 'io',
          label: 'IO 线程',
          value: <Badge status={runBadge(slave.io_running)}>{slave.io_running || '—'}</Badge>,
        },
        {
          id: 'sql',
          label: 'SQL 线程',
          value: <Badge status={runBadge(slave.sql_running)}>{slave.sql_running || '—'}</Badge>,
        },
        {
          id: 'delay',
          label: '复制延迟',
          value: (
            <Badge status={slave.seconds_behind != null && slave.seconds_behind > 0 ? 'warn' : 'neutral'}>
              {slave.seconds_behind == null ? 'NULL' : `${slave.seconds_behind}s`}
            </Badge>
          ),
        },
        {
          id: 'master',
          label: '指向主库',
          value: (
            <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
              {slave.master_host || '—'}
            </span>
          ),
        },
        {
          id: 'logfile',
          label: 'Master_Log_File',
          value: (
            <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
              {slave.master_log_file || '—'}
            </span>
          ),
        },
      ]
    : []

  const slaveCols: Column<SlaveRow>[] = [
    { key: 'label', header: '项目', width: '160px', cell: (r) => <span className="text-muted">{r.label}</span> },
    { key: 'value', header: '状态', cell: (r) => r.value },
  ]

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
          MySQL 主从
        </h1>
        <p className="text-xs text-muted">配置主从连接、建复制用户、搭建并监控复制状态</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="md" onClick={() => setDialog('configure')}>
            <GitBranch size={15} />
            搭建从库
          </Button>
          <Button variant="ghost" size="md" onClick={() => setDialog('repl-user')}>
            <UserPlus size={15} />
            建复制用户
          </Button>
          <Button variant="ghost" size="md" onClick={() => setDialog('settings')}>
            <Settings2 size={15} />
            连接设置
          </Button>
        </div>
        <Button
          size="md"
          variant="ghost"
          onClick={() => {
            void loadMaster()
            void loadSlave()
          }}
          disabled={busy}
        >
          <RefreshCw size={15} />
          刷新状态
        </Button>
      </div>

      {loadErr && (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusCard
          icon={<Server size={16} />}
          title="主库"
          role={settings ? `${settings.master_host}:${settings.master_port}` : '—'}
          onRefresh={() => void loadMaster()}
          busy={busy}
        >
          {master ? (
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col rounded-(--radius-card) bg-surface-2 px-3 py-2">
                <dt className="text-xs text-muted">Binlog File</dt>
                <dd className="truncate font-[family-name:var(--font-mono)] text-sm text-text">
                  {master.file || '—'}
                </dd>
              </div>
              <div className="flex flex-col rounded-(--radius-card) bg-surface-2 px-3 py-2">
                <dt className="text-xs text-muted">Position</dt>
                <dd className="font-[family-name:var(--font-mono)] text-sm text-text">{master.position}</dd>
              </div>
            </dl>
          ) : (
            <p className="rounded-(--radius-card) border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
              点击「查询」获取 SHOW MASTER STATUS
            </p>
          )}
        </StatusCard>

        <StatusCard
          icon={<Database size={16} />}
          title="从库"
          role={settings ? `${settings.slave_host}:${settings.slave_port}` : '—'}
          onRefresh={() => void loadSlave()}
          busy={busy}
        >
          {slave ? (
            <div className="flex items-center gap-2">
              <Badge status={slave.healthy ? 'online' : 'crit'}>
                {slave.healthy ? '复制健康' : '复制异常'}
              </Badge>
              <span className="text-xs text-muted">IO + SQL 线程均运行视为健康</span>
            </div>
          ) : (
            <p className="rounded-(--radius-card) border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
              点击「查询」获取 SHOW SLAVE STATUS
            </p>
          )}
        </StatusCard>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text">从库复制详情</h2>
          {slave && (
            <ActionLinks>
              <ActionLink onClick={() => void startSlave()} disabled={busy}>
                启动复制
              </ActionLink>
              <ActionLink danger onClick={stopSlave} disabled={busy}>
                停止复制
              </ActionLink>
              <ActionLink danger onClick={resetSlave} disabled={busy}>
                重置复制
              </ActionLink>
            </ActionLinks>
          )}
        </div>
        {slave ? (
          <>
            <Table columns={slaveCols} rows={slaveRows} rowKey={(r) => r.id} />
            {slave.last_io_error && <p className="text-xs text-crit">IO 错误: {slave.last_io_error}</p>}
            {slave.last_sql_error && <p className="text-xs text-crit">SQL 错误: {slave.last_sql_error}</p>}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-(--radius-card) border border-dashed border-border px-4 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warn-soft text-warn">
              <GitBranch size={20} />
            </span>
            <p className="text-sm text-text">尚未配置主从复制</p>
            <p className="max-w-md text-xs text-muted">
              先在「连接设置」填好主从连接,再用「建复制用户」在主库建账号,最后「搭建从库」指向主库并启动复制。
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={() => setDialog('configure')}>
                <GitBranch size={14} />
                搭建从库
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void loadSlave()} disabled={busy}>
                查询状态
              </Button>
            </div>
          </div>
        )}
      </Card>

      {dialog === 'settings' && settings && (
        <SettingsModal
          initial={settings}
          passwordsSet={passwordsSet}
          onClose={() => setDialog(null)}
          onSaved={(res) => {
            setSettings(res.settings)
            setPasswordsSet(res.passwords_set ?? [])
            setDialog(null)
            setFeedback({ kind: 'ok', text: '设置已保存' })
          }}
        />
      )}
      {dialog === 'repl-user' && (
        <ReplUserModal
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            setFeedback({ kind: 'ok', text: '复制用户已创建' })
          }}
        />
      )}
      {dialog === 'configure' && (
        <ConfigureSlaveModal
          masterHint={settings ? settings.master_host : ''}
          portHint={settings ? settings.master_port : 3306}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null)
            setFeedback({ kind: 'ok', text: '从库已配置' })
            setSlave(await apiFetch<SlaveStatus>('/api/m/mysqlrepl/slave/status').catch(() => slave))
          }}
        />
      )}
    </div>
  )
}

/** 固定尺寸弹窗内提交,统一 busy / 错误处理。返回 true 表示成功。 */
function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      return true
    } catch (e) {
      setErr(errorText(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, err, submit }
}

function SettingsModal({
  initial,
  passwordsSet,
  onClose,
  onSaved,
}: {
  initial: Settings
  passwordsSet: string[]
  onClose: () => void
  onSaved: (res: SettingsResponse) => void
}) {
  const [form, setForm] = useState<Settings>(initial)
  const { busy, err, submit } = useSubmit()

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((s) => ({ ...s, [key]: value }))
  }

  function save() {
    void submit(async () => {
      const res = await apiFetch<SettingsResponse>('/api/m/mysqlrepl/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      onSaved(res)
    })
  }

  const passHint = (key: string) => (passwordsSet.includes(key) ? '(已设置,留空不改)' : '')

  return (
    <Modal title="连接设置" size="lg" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">主库</span>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="主库 host" spellCheck={false} value={form.master_host} onChange={(e) => set('master_host', e.target.value)} />
            <Input label="主库 port" type="number" value={String(form.master_port)} onChange={(e) => set('master_port', Number(e.target.value) || 0)} />
            <Input label="主库用户" spellCheck={false} value={form.master_user} onChange={(e) => set('master_user', e.target.value)} />
            <Input
              label={`主库密码${passHint('master')}`}
              type="password"
              autoComplete="new-password"
              placeholder="只写,不会回显"
              value={form.master_password}
              onChange={(e) => set('master_password', e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">从库</span>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="从库 host" spellCheck={false} value={form.slave_host} onChange={(e) => set('slave_host', e.target.value)} />
            <Input label="从库 port" type="number" value={String(form.slave_port)} onChange={(e) => set('slave_port', Number(e.target.value) || 0)} />
            <Input label="从库用户" spellCheck={false} value={form.slave_user} onChange={(e) => set('slave_user', e.target.value)} />
            <Input
              label={`从库密码${passHint('slave')}`}
              type="password"
              autoComplete="new-password"
              placeholder="只写,不会回显"
              value={form.slave_password}
              onChange={(e) => set('slave_password', e.target.value)}
            />
          </div>
        </div>
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={save} disabled={busy}>
            保存设置
          </Button>
          {busy && <Spinner size={16} />}
        </div>
      </div>
    </Modal>
  )
}

function ReplUserModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ repl_user: '', repl_password: '', slave_host: '%' })
  const { busy, err, submit } = useSubmit()

  function create() {
    void (async () => {
      const ok = await submit(async () => {
        await apiFetch('/api/m/mysqlrepl/master/repl-user', {
          method: 'POST',
          body: JSON.stringify(form),
        })
      })
      if (ok) onDone()
    })()
  }

  const invalid = form.repl_user.trim().length === 0 || form.repl_password.length === 0

  return (
    <Modal title="建复制用户(在主库)" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4">
          <Input label="复制账号" spellCheck={false} value={form.repl_user} onChange={(e) => setForm((u) => ({ ...u, repl_user: e.target.value }))} />
          <Input label="复制口令" type="password" autoComplete="new-password" value={form.repl_password} onChange={(e) => setForm((u) => ({ ...u, repl_password: e.target.value }))} />
          <Input label="允许的从库 host" spellCheck={false} value={form.slave_host} onChange={(e) => setForm((u) => ({ ...u, slave_host: e.target.value }))} />
        </div>
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={create} disabled={busy || invalid}>
            创建复制用户
          </Button>
          {busy && <Spinner size={16} />}
        </div>
      </div>
    </Modal>
  )
}

function ConfigureSlaveModal({
  masterHint,
  portHint,
  onClose,
  onDone,
}: {
  masterHint: string
  portHint: number
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState({
    master_host: masterHint,
    master_port: String(portHint || 3306),
    repl_user: '',
    repl_password: '',
    master_log_file: '',
    master_log_pos: '0',
  })
  const { busy, err, submit } = useSubmit()

  function configure() {
    void (async () => {
      const ok = await submit(async () => {
        await apiFetch('/api/m/mysqlrepl/slave/configure', {
          method: 'POST',
          body: JSON.stringify({
            master_host: form.master_host.trim(),
            master_port: Number(form.master_port) || 3306,
            repl_user: form.repl_user.trim(),
            repl_password: form.repl_password,
            master_log_file: form.master_log_file.trim(),
            master_log_pos: Number(form.master_log_pos) || 0,
          }),
        })
      })
      if (ok) onDone()
    })()
  }

  const invalid = form.master_host.trim().length === 0 || form.repl_user.trim().length === 0

  return (
    <Modal title="搭建从库(configure slave)" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          从库执行 CHANGE MASTER TO 指向主库并启动复制。Master_Log_File / Pos 取自主库的 SHOW MASTER STATUS。
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="主库 host" spellCheck={false} value={form.master_host} onChange={(e) => setForm((c) => ({ ...c, master_host: e.target.value }))} />
          <Input label="主库 port" type="number" value={form.master_port} onChange={(e) => setForm((c) => ({ ...c, master_port: e.target.value }))} />
          <Input label="复制账号" spellCheck={false} value={form.repl_user} onChange={(e) => setForm((c) => ({ ...c, repl_user: e.target.value }))} />
          <Input label="复制口令" type="password" autoComplete="new-password" value={form.repl_password} onChange={(e) => setForm((c) => ({ ...c, repl_password: e.target.value }))} />
          <Input label="Master_Log_File" spellCheck={false} value={form.master_log_file} onChange={(e) => setForm((c) => ({ ...c, master_log_file: e.target.value }))} />
          <Input label="Master_Log_Pos" type="number" value={form.master_log_pos} onChange={(e) => setForm((c) => ({ ...c, master_log_pos: e.target.value }))} />
        </div>
        {err && <p className="text-sm text-crit">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={configure} disabled={busy || invalid}>
            configure slave
          </Button>
          {busy && <Spinner size={16} />}
        </div>
      </div>
    </Modal>
  )
}
