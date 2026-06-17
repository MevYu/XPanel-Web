import { useState } from 'react'
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
  errorText,
  downloadBlob,
  importSql,
} from './shared'

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

/** CreateDbModal 新建数据库弹窗。 */
export function CreateDbModal({
  engine,
  onClose,
  onCreated,
}: {
  engine: Engine
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    const database = name.trim()
    if (!database) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/api/m/database/${engine}/databases`, {
        method: 'POST',
        body: JSON.stringify({ database }),
      })
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
        {err && <ErrorNote text={err} />}
        <Footer
          onClose={onClose}
          onSubmit={() => void submit()}
          busy={busy}
          disabled={!name.trim()}
          submitText="创建"
        />
      </div>
    </Modal>
  )
}

/** CreateUserModal 新建用户弹窗(用户名 + 密码)。 */
export function CreateUserModal({
  engine,
  onClose,
  onCreated,
}: {
  engine: Engine
  onClose: () => void
  onCreated: () => void
}) {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    const u = user.trim()
    if (!u || !password) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/api/m/database/${engine}/users`, {
        method: 'POST',
        body: JSON.stringify({ user: u, password }),
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
        <Input
          label="密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <ErrorNote text={err} />}
        <Footer
          onClose={onClose}
          onSubmit={() => void submit()}
          busy={busy}
          disabled={!user.trim() || !password}
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
      <div className="flex flex-col gap-5">
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
