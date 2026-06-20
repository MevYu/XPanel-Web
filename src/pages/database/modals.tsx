import { useState, type ReactNode } from 'react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import {
  type Engine,
  type DbInfo,
  type DbUser,
  ENGINE_LABEL,
  DANGER,
  errorText,
  downloadBlob,
  importSql,
} from './shared'

// 字符集/排序规则预设(值过后端 ^[A-Za-z0-9_]{1,64}$ 白名单);postgres 用 encoding,无 collation。
const CHARSETS: Record<Engine, { label: string; charset: string; collation: string }[]> = {
  mysql: [
    { label: 'utf8mb4 · general_ci(推荐)', charset: 'utf8mb4', collation: 'utf8mb4_general_ci' },
    { label: 'utf8mb4 · unicode_ci', charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
    { label: 'utf8 · general_ci', charset: 'utf8', collation: 'utf8_general_ci' },
    { label: 'latin1 · swedish_ci', charset: 'latin1', collation: 'latin1_swedish_ci' },
  ],
  postgres: [
    { label: 'UTF8', charset: 'UTF8', collation: '' },
    { label: 'LATIN1', charset: 'LATIN1', collation: '' },
  ],
}

// 权限范围 → MySQL 账户 host。
type Scope = 'localhost' | '%' | 'ip'

// scopeHost 把范围选择折算成 host;非 mysql 返回空串(PG 账户无 host)。
function scopeHost(isMysql: boolean, scope: Scope, ip: string): string {
  if (!isMysql) return ''
  return scope === 'ip' ? ip.trim() : scope
}

// genPassword 生成强随机密码;仅用 SQL 字面量安全字符(不含引号/反斜杠)。
function genPassword(len = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%^*_-+='
  const buf = new Uint32Array(len)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length]
  return out
}

const selectClass =
  'h-10 rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 text-sm text-text outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] transition-[border-color,box-shadow,background-color] duration-(--dur-micro) ease-(--ease-out) hover:border-border-strong focus:border-brand focus:bg-surface-2 focus:shadow-[0_0_0_3px_var(--color-brand-soft),inset_0_1px_2px_rgba(0,0,0,0.25)]'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-muted">{label}</label>
      {children}
    </div>
  )
}

// ScopeField MySQL 权限范围选择(本地/所有人/指定 IP);指定 IP 时展开输入框。
function ScopeField({
  scope,
  onScope,
  ip,
  onIp,
}: {
  scope: Scope
  onScope: (s: Scope) => void
  ip: string
  onIp: (v: string) => void
}) {
  return (
    <Field label="权限范围">
      <select className={selectClass} value={scope} onChange={(e) => onScope(e.target.value as Scope)}>
        <option value="localhost">本地(localhost)</option>
        <option value="%">所有人(%)</option>
        <option value="ip">指定 IP</option>
      </select>
      {scope === 'ip' && (
        <input
          className={`${selectClass} mt-2`}
          placeholder="如 10.0.0.5"
          value={ip}
          spellCheck={false}
          onChange={(e) => onIp(e.target.value)}
        />
      )}
    </Field>
  )
}

// PasswordField 密码输入 + 一键生成。
function PasswordField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <Field label="密码">
      <div className="flex gap-2">
        <input
          className={`${selectClass} flex-1`}
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button variant="ghost" onClick={() => onChange(genPassword())} disabled={disabled}>
          生成
        </Button>
      </div>
    </Field>
  )
}

function ErrorNote({ text }: { text: string }) {
  return (
    <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
      {text}
    </p>
  )
}

function Footer({
  onClose,
  onSubmit,
  busy,
  disabled,
  submitText,
  danger,
}: {
  onClose: () => void
  onSubmit: () => void
  busy: boolean
  disabled: boolean
  submitText: string
  danger?: boolean
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        取消
      </Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={onSubmit} disabled={disabled || busy}>
        {busy && <Spinner size={14} />}
        {submitText}
      </Button>
    </div>
  )
}

/** CreateDbModal 新建数据库:aaPanel 式一站创建——库 + 字符集 + 同名用户 + 授权 + 权限范围。 */
export function CreateDbModal({
  engine,
  onClose,
  onCreated,
}: {
  engine: Engine
  onClose: () => void
  onCreated: () => void
}) {
  const isMysql = engine === 'mysql'
  const charsets = CHARSETS[engine]
  const [name, setName] = useState('')
  const [csIdx, setCsIdx] = useState(0)
  const [withUser, setWithUser] = useState(true)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState(() => genPassword())
  const [scope, setScope] = useState<Scope>('localhost')
  const [ip, setIp] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const database = name.trim()
  const uname = user.trim() || database
  const needIp = isMysql && scope === 'ip'
  const canSubmit = !!database && (!withUser || (!!password && (!needIp || !!ip.trim())))

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    const cs = charsets[csIdx]
    const host = scopeHost(isMysql, scope, ip)
    try {
      await apiFetch(`/api/m/database/${engine}/databases`, {
        method: 'POST',
        body: JSON.stringify({ database, charset: cs.charset, collation: cs.collation || undefined }),
      })
      if (withUser) {
        await apiFetch(`/api/m/database/${engine}/users`, {
          method: 'POST',
          body: JSON.stringify({ user: uname, password, ...(host ? { host } : {}) }),
        })
        await apiFetch(`/api/m/database/${engine}/grant`, {
          method: 'POST',
          body: JSON.stringify({ database, user: uname, ...(host ? { host } : {}) }),
        })
      }
      onCreated()
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="新建数据库" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">{ENGINE_LABEL[engine]}</p>
        <Input
          label="数据库名"
          placeholder="如 myapp"
          value={name}
          spellCheck={false}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <Field label="字符集">
          <select className={selectClass} value={csIdx} onChange={(e) => setCsIdx(Number(e.target.value))}>
            {charsets.map((c, i) => (
              <option key={c.label} value={i}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={withUser} onChange={(e) => setWithUser(e.target.checked)} />
          同时创建用户并授予该库全部权限
        </label>

        {withUser && (
          <>
            <Input
              label="用户名"
              placeholder={database || '默认与库名相同'}
              value={user}
              spellCheck={false}
              onChange={(e) => setUser(e.target.value)}
            />
            <PasswordField value={password} onChange={setPassword} disabled={busy} />
            {isMysql && <ScopeField scope={scope} onScope={setScope} ip={ip} onIp={setIp} />}
          </>
        )}

        {err && <ErrorNote text={err} />}
        <Footer
          onClose={onClose}
          onSubmit={() => void submit()}
          busy={busy}
          disabled={!canSubmit}
          submitText="创建"
        />
      </div>
    </Modal>
  )
}

/** CreateUserModal 新建用户弹窗:用户名 + 密码(可生成) + 权限范围(MySQL)。 */
export function CreateUserModal({
  engine,
  onClose,
  onCreated,
}: {
  engine: Engine
  onClose: () => void
  onCreated: () => void
}) {
  const isMysql = engine === 'mysql'
  const [user, setUser] = useState('')
  const [password, setPassword] = useState(() => genPassword())
  const [scope, setScope] = useState<Scope>('localhost')
  const [ip, setIp] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const needIp = isMysql && scope === 'ip'
  const canSubmit = !!user.trim() && !!password && (!needIp || !!ip.trim())

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    const host = scopeHost(isMysql, scope, ip)
    try {
      await apiFetch(`/api/m/database/${engine}/users`, {
        method: 'POST',
        body: JSON.stringify({ user: user.trim(), password, ...(host ? { host } : {}) }),
      })
      onCreated()
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="新建用户" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">{ENGINE_LABEL[engine]}</p>
        <Input
          label="用户名"
          placeholder="如 appuser"
          value={user}
          spellCheck={false}
          autoFocus
          onChange={(e) => setUser(e.target.value)}
        />
        <PasswordField value={password} onChange={setPassword} disabled={busy} />
        {isMysql && <ScopeField scope={scope} onScope={setScope} ip={ip} onIp={setIp} />}
        {err && <ErrorNote text={err} />}
        <Footer
          onClose={onClose}
          onSubmit={() => void submit()}
          busy={busy}
          disabled={!canSubmit}
          submitText="创建"
        />
      </div>
    </Modal>
  )
}

/** GrantModal 授权 / 回收弹窗:固定用户,选库,授权或回收全部权限。 */
export function GrantModal({
  engine,
  user,
  databases,
  onClose,
  onDone,
}: {
  engine: Engine
  user: DbUser
  databases: DbInfo[]
  onClose: () => void
  onDone: () => void
}) {
  const [database, setDatabase] = useState(databases[0]?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function act(kind: 'grant' | 'revoke') {
    const db = database.trim()
    if (!db) return
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await apiFetch(`/api/m/database/${engine}/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ database: db, user: user.user }),
      })
      setOk(kind === 'grant' ? '已授予全部权限' : '已回收授权')
      onDone()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`授权管理 · ${user.user}`} size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">数据库</span>
          {databases.length > 0 ? (
            <select
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className="h-10 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              {databases.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <Input
              label=""
              placeholder="数据库名"
              value={database}
              spellCheck={false}
              onChange={(e) => setDatabase(e.target.value)}
            />
          )}
        </label>
        <p className="text-xs text-muted">授权将对所选库授予全部权限,回收则移除该库上的全部权限。</p>
        {err && <ErrorNote text={err} />}
        {ok && <p className="text-sm text-online">{ok}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => void act('revoke')} disabled={busy || !database.trim()}>
            {busy && <Spinner size={14} />}
            回收
          </Button>
          <Button onClick={() => void act('grant')} disabled={busy || !database.trim()}>
            授权全部
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** PasswordModal 改密弹窗:固定用户,设新密码。 */
export function PasswordModal({
  engine,
  user,
  onClose,
  onDone,
}: {
  engine: Engine
  user: DbUser
  onClose: () => void
  onDone: () => void
}) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!password) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/api/m/database/${engine}/users/password`, {
        method: 'POST',
        body: JSON.stringify({ user: user.user, password }),
      })
      onDone()
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={`修改密码 · ${user.user}`} size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="新密码"
          type="password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <ErrorNote text={err} />}
        <Footer
          onClose={onClose}
          onSubmit={() => void submit()}
          busy={busy}
          disabled={!password}
          submitText="修改密码"
        />
      </div>
    </Modal>
  )
}

/** TransferModal 导入 / 导出弹窗:导出某库 .sql(可 gzip),或上传 .sql/.sql.gz 导入(危险)。 */
export function TransferModal({
  engine,
  databases,
  onClose,
  onDone,
}: {
  engine: Engine
  databases: DbInfo[]
  onClose: () => void
  onDone: () => void
}) {
  const [database, setDatabase] = useState(databases[0]?.name ?? '')
  const [gzip, setGzip] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function doExport() {
    const db = database.trim()
    if (!db) return
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      const name = gzip ? `${db}.sql.gz` : `${db}.sql`
      const q = `?database=${encodeURIComponent(db)}${gzip ? '&gzip=1' : ''}`
      await downloadBlob(`/api/m/database/${engine}/export${q}`, name)
      setOk('已开始下载导出文件')
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function doImport() {
    const db = database.trim()
    if (!db || !file) return
    if (!window.confirm(`确认将「${file.name}」导入到数据库「${db}」?现有数据可能被覆盖,不可恢复。`)) return
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      const isGz = file.name.toLowerCase().endsWith('.gz')
      await importSql(engine, db, file, isGz)
      setOk('导入完成')
      onDone()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const selectId = 'transfer-db'

  return (
    <Modal title="导入 / 导出" size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">数据库</span>
          {databases.length > 0 ? (
            <select
              id={selectId}
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className="h-10 rounded-(--radius-sm) border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              {databases.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <Input
              label=""
              id={selectId}
              placeholder="数据库名"
              value={database}
              spellCheck={false}
              onChange={(e) => setDatabase(e.target.value)}
            />
          )}
        </label>

        <section className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface-2/40 p-4">
          <h3 className="text-sm font-medium text-text">导出</h3>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={gzip} onChange={(e) => setGzip(e.target.checked)} />
            gzip 压缩(.sql.gz)
          </label>
          <div>
            <Button variant="ghost" onClick={() => void doExport()} disabled={busy || !database.trim()}>
              导出并下载
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-(--radius-card) border border-border bg-surface-2/40 p-4">
          <h3 className="text-sm font-medium text-text">导入</h3>
          <p className="text-xs text-muted">上传 .sql 或 .sql.gz,导入到所选数据库。危险操作,现有数据可能被覆盖。</p>
          <input
            type="file"
            accept=".sql,.gz,.sql.gz"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-muted file:mr-3 file:rounded-(--radius-sm) file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-text hover:file:bg-elevated"
          />
          <div>
            <Button variant="danger" onClick={() => void doImport()} disabled={busy || !database.trim() || !file}>
              {busy && <Spinner size={14} />}
              导入
            </Button>
          </div>
        </section>

        {err && <ErrorNote text={err} />}
        {ok && <p className="text-sm text-online">{ok}</p>}
      </div>
    </Modal>
  )
}

/** RootPasswordModal 重置数据库超级用户密码;同步更新面板连接配置(后端 verify 后才落库)。 */
export function RootPasswordModal({
  engine,
  onClose,
  onDone,
}: {
  engine: Engine
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [password, setPassword] = useState(() => genPassword())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!password || busy) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/api/m/database/${engine}/root-password`, {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({ password }),
      })
      onDone('root 密码已重置')
      onClose()
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="重置 root 密码" size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-warn">
          将修改 {ENGINE_LABEL[engine]} 超级用户密码,并同步更新面板连接配置(连接验证通过后才生效)。
        </p>
        <PasswordField value={password} onChange={setPassword} disabled={busy} />
        {err && <ErrorNote text={err} />}
        <Footer
          onClose={onClose}
          onSubmit={() => void submit()}
          busy={busy}
          disabled={!password}
          submitText="重置密码"
          danger
        />
      </div>
    </Modal>
  )
}

interface MaintainResult {
  table: string
  ok: boolean
  message?: string
}

/** MaintainModal 库维护:修复/优化/分析全部表,MySQL 另支持转换字符集。 */
export function MaintainModal({
  engine,
  database,
  onClose,
}: {
  engine: Engine
  database: string
  onClose: () => void
}) {
  const charsets = CHARSETS[engine]
  const [csIdx, setCsIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<MaintainResult[] | null>(null)

  async function run(fn: () => Promise<{ results: MaintainResult[] }>) {
    setBusy(true)
    setErr(null)
    setResults(null)
    try {
      setResults((await fn()).results)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const maintain = (action: 'repair' | 'optimize' | 'analyze') =>
    run(() =>
      apiFetch<{ results: MaintainResult[] }>(`/api/m/database/${engine}/maintain`, {
        method: 'POST',
        body: JSON.stringify({ database, action }),
      }),
    )

  const convert = () => {
    const cs = charsets[csIdx]
    return run(() =>
      apiFetch<{ results: MaintainResult[] }>(`/api/m/database/${engine}/convert-charset`, {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({ database, charset: cs.charset, collation: cs.collation }),
      }),
    )
  }

  return (
    <Modal title={`维护 · ${database}`} size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="表维护(全部表)">
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => void maintain('repair')}>
              修复
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void maintain('optimize')}>
              优化
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void maintain('analyze')}>
              分析
            </Button>
          </div>
        </Field>
        {engine === 'mysql' && (
          <Field label="转换字符集">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={`${selectClass} flex-1`}
                value={csIdx}
                onChange={(e) => setCsIdx(Number(e.target.value))}
              >
                {charsets.map((c, i) => (
                  <option key={c.label} value={i}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Button disabled={busy} onClick={() => void convert()}>
                转换
              </Button>
            </div>
          </Field>
        )}
        {busy && (
          <div className="flex justify-center py-2">
            <Spinner size={18} />
          </div>
        )}
        {err && <ErrorNote text={err} />}
        {results && (
          <div className="max-h-60 overflow-auto rounded-(--radius-sm) border border-border text-[13px]">
            {results.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5 last:border-b-0"
              >
                <span className="truncate font-[family-name:var(--font-mono)] text-text">{r.table}</span>
                <span className={r.ok ? 'text-online' : 'text-crit'}>
                  {r.message || (r.ok ? 'OK' : '失败')}
                </span>
              </div>
            ))}
            {results.length === 0 && <p className="px-3 py-2 text-muted">无表</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
