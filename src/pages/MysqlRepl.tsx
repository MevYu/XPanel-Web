import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
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

/** MySQL主从:配置主/从连接(密码只写)、查 master/slave status、建复制用户、configure/start/stop/reset。 */
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

  const [replUser, setReplUser] = useState({ repl_user: '', repl_password: '', slave_host: '%' })
  const [cfg, setCfg] = useState({
    master_host: '',
    master_port: '3306',
    repl_user: '',
    repl_password: '',
    master_log_file: '',
    master_log_pos: '0',
  })

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const s = await apiFetch<{ settings: Settings; passwords_set: string[] }>(
        '/api/m/mysqlrepl/settings',
      )
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

  async function call(fn: () => Promise<void>, ok: string) {
    if (busy || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await fn()
      setFeedback({ kind: 'ok', text: ok })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const saveSettings = () =>
    call(async () => {
      if (!settings) return
      const res = await apiFetch<{ settings: Settings; passwords_set: string[] }>(
        '/api/m/mysqlrepl/settings',
        { method: 'PUT', body: JSON.stringify(settings) },
      )
      setSettings(res.settings)
      setPasswordsSet(res.passwords_set ?? [])
    }, '设置已保存')

  const loadMaster = () =>
    call(async () => {
      setMaster(await apiFetch<MasterStatus>('/api/m/mysqlrepl/master/status'))
    }, 'master status 已刷新')

  const loadSlave = () =>
    call(async () => {
      setSlave(await apiFetch<SlaveStatus>('/api/m/mysqlrepl/slave/status'))
    }, 'slave status 已刷新')

  const createReplUser = () =>
    call(async () => {
      await apiFetch('/api/m/mysqlrepl/master/repl-user', {
        method: 'POST',
        body: JSON.stringify(replUser),
      })
      setReplUser((u) => ({ ...u, repl_password: '' }))
    }, '复制用户已创建')

  const configureSlave = () =>
    call(async () => {
      await apiFetch('/api/m/mysqlrepl/slave/configure', {
        method: 'POST',
        body: JSON.stringify({
          master_host: cfg.master_host.trim(),
          master_port: Number(cfg.master_port) || 3306,
          repl_user: cfg.repl_user.trim(),
          repl_password: cfg.repl_password,
          master_log_file: cfg.master_log_file.trim(),
          master_log_pos: Number(cfg.master_log_pos) || 0,
        }),
      })
      setCfg((c) => ({ ...c, repl_password: '' }))
    }, '从库已配置')

  const startSlave = () =>
    call(async () => {
      await apiFetch('/api/m/mysqlrepl/slave/start', { method: 'POST' })
      setSlave(await apiFetch<SlaveStatus>('/api/m/mysqlrepl/slave/status').catch(() => slave!))
    }, '从库复制已启动')

  const stopSlave = () => {
    if (!window.confirm('确认停止从库复制(stop slave)?此操作危险。')) return
    void call(async () => {
      await apiFetch('/api/m/mysqlrepl/slave/stop', { method: 'POST', headers: DANGER })
    }, '从库复制已停止')
  }

  const resetSlave = () => {
    if (!window.confirm('确认重置从库复制(reset slave)?将清除复制配置,危险且不可恢复。')) return
    void call(async () => {
      await apiFetch('/api/m/mysqlrepl/slave/reset', { method: 'POST', headers: DANGER })
      setSlave(null)
    }, '从库复制已重置')
  }

  function setS<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s))
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

  const runBadge = (v: string) => (v === 'Yes' ? 'online' : v === 'Connecting' ? 'warn' : 'crit')

  return (
    <div className="flex flex-col gap-4">
      {loadErr && <p className="text-sm text-crit">{loadErr}</p>}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}

      {settings && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">连接设置</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="主库 host" spellCheck={false} value={settings.master_host} onChange={(e) => setS('master_host', e.target.value)} />
            <Input label="主库 port" type="number" value={String(settings.master_port)} onChange={(e) => setS('master_port', Number(e.target.value) || 0)} />
            <Input label="主库用户" spellCheck={false} value={settings.master_user} onChange={(e) => setS('master_user', e.target.value)} />
            <Input
              label={`主库密码${passwordsSet.includes('master') ? '(已设置,留空不改)' : ''}`}
              type="password"
              autoComplete="new-password"
              placeholder="只写,不会回显"
              value={settings.master_password}
              onChange={(e) => setS('master_password', e.target.value)}
            />
            <Input label="从库 host" spellCheck={false} value={settings.slave_host} onChange={(e) => setS('slave_host', e.target.value)} />
            <Input label="从库 port" type="number" value={String(settings.slave_port)} onChange={(e) => setS('slave_port', Number(e.target.value) || 0)} />
            <Input label="从库用户" spellCheck={false} value={settings.slave_user} onChange={(e) => setS('slave_user', e.target.value)} />
            <Input
              label={`从库密码${passwordsSet.includes('slave') ? '(已设置,留空不改)' : ''}`}
              type="password"
              autoComplete="new-password"
              placeholder="只写,不会回显"
              value={settings.slave_password}
              onChange={(e) => setS('slave_password', e.target.value)}
            />
          </div>
          <div>
            <Button onClick={() => void saveSettings()} disabled={busy}>
              保存设置
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text">主库状态</h2>
          <Button size="sm" variant="ghost" onClick={() => void loadMaster()} disabled={busy}>
            查询
          </Button>
        </div>
        {master ? (
          <div className="flex flex-wrap gap-x-8 gap-y-2 font-[family-name:var(--font-mono)] text-sm text-text">
            <span>File: {master.file || '—'}</span>
            <span>Position: {master.position}</span>
          </div>
        ) : (
          <p className="text-sm text-muted">点击查询获取 SHOW MASTER STATUS。</p>
        )}
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-text">建复制用户(在主库)</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="复制账号" spellCheck={false} value={replUser.repl_user} onChange={(e) => setReplUser((u) => ({ ...u, repl_user: e.target.value }))} />
            <Input label="复制口令" type="password" autoComplete="new-password" value={replUser.repl_password} onChange={(e) => setReplUser((u) => ({ ...u, repl_password: e.target.value }))} />
            <Input label="允许的从库 host" spellCheck={false} value={replUser.slave_host} onChange={(e) => setReplUser((u) => ({ ...u, slave_host: e.target.value }))} />
          </div>
          <div>
            <Button
              onClick={() => void createReplUser()}
              disabled={busy || replUser.repl_user.trim().length === 0 || replUser.repl_password.length === 0}
            >
              创建复制用户
            </Button>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text">从库状态</h2>
          <Button size="sm" variant="ghost" onClick={() => void loadSlave()} disabled={busy}>
            查询
          </Button>
        </div>
        {slave ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge status={slave.healthy ? 'online' : 'crit'}>
                {slave.healthy ? '健康' : '异常'}
              </Badge>
              <Badge status={runBadge(slave.io_running)}>IO: {slave.io_running || '—'}</Badge>
              <Badge status={runBadge(slave.sql_running)}>SQL: {slave.sql_running || '—'}</Badge>
              <Badge status={slave.seconds_behind != null && slave.seconds_behind > 0 ? 'warn' : 'neutral'}>
                延迟: {slave.seconds_behind == null ? 'NULL' : `${slave.seconds_behind}s`}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-1 font-[family-name:var(--font-mono)] text-xs text-muted">
              <span>Master_Host: {slave.master_host || '—'}</span>
              <span>Master_Log_File: {slave.master_log_file || '—'}</span>
            </div>
            {slave.last_io_error && <p className="text-xs text-crit">IO 错误: {slave.last_io_error}</p>}
            {slave.last_sql_error && <p className="text-xs text-crit">SQL 错误: {slave.last_sql_error}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted">点击查询获取 SHOW SLAVE STATUS。</p>
        )}

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-text">配置从库复制</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="主库 host" spellCheck={false} value={cfg.master_host} onChange={(e) => setCfg((c) => ({ ...c, master_host: e.target.value }))} />
            <Input label="主库 port" type="number" value={cfg.master_port} onChange={(e) => setCfg((c) => ({ ...c, master_port: e.target.value }))} />
            <Input label="复制账号" spellCheck={false} value={cfg.repl_user} onChange={(e) => setCfg((c) => ({ ...c, repl_user: e.target.value }))} />
            <Input label="复制口令" type="password" autoComplete="new-password" value={cfg.repl_password} onChange={(e) => setCfg((c) => ({ ...c, repl_password: e.target.value }))} />
            <Input label="Master_Log_File" spellCheck={false} value={cfg.master_log_file} onChange={(e) => setCfg((c) => ({ ...c, master_log_file: e.target.value }))} />
            <Input label="Master_Log_Pos" type="number" value={cfg.master_log_pos} onChange={(e) => setCfg((c) => ({ ...c, master_log_pos: e.target.value }))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void configureSlave()}
              disabled={busy || cfg.master_host.trim().length === 0 || cfg.repl_user.trim().length === 0}
            >
              configure slave
            </Button>
            <Button variant="ghost" onClick={() => void startSlave()} disabled={busy}>
              start slave
            </Button>
            <Button variant="danger" onClick={() => stopSlave()} disabled={busy}>
              stop slave
            </Button>
            <Button variant="danger" onClick={() => resetSlave()} disabled={busy}>
              reset slave
            </Button>
            {busy && <Spinner size={16} />}
          </div>
        </div>
      </Card>
    </div>
  )
}
