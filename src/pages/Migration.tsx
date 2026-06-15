import { useCallback, useEffect, useState } from 'react'
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

const fieldClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

interface Package {
  id: number
  name: string
  filename: string
  domain: string
  site_path: string
  php_version: string
  db_kind: string
  db_name: string
  size: number
  created_at: number
}

interface Settings {
  migration_dir: string
  mysqldump: string
  pgdump: string
  mysql_cli: string
  psql_cli: string
}

interface ExportForm {
  name: string
  site_path: string
  domain: string
  php_version: string
  db_kind: string
  db_name: string
}

interface ImportForm {
  package_id: string
  site_dest: string
  import_db: boolean
  db_name: string
}

const emptyExport: ExportForm = {
  name: '',
  site_path: '',
  domain: '',
  php_version: '',
  db_kind: '',
  db_name: '',
}

const emptyImport: ImportForm = { package_id: '', site_dest: '', import_db: false, db_name: '' }

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

/** 一键迁移:迁移包列表/导出/导入(危险)/下载/删除/设置,全部需要 admin。 */
export default function Migration() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [packages, setPackages] = useState<Package[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [exp, setExp] = useState<ExportForm>(emptyExport)
  const [imp, setImp] = useState<ImportForm>(emptyImport)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [p, s] = await Promise.all([
        apiFetch<Package[]>('/api/m/migration/packages'),
        apiFetch<Settings>('/api/m/migration/settings'),
      ])
      setPackages(p ?? [])
      setSettings(s)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void load()
    else setLoading(false)
  }, [isAdmin, load])

  const canExport = isAdmin && !busy && exp.site_path.trim().length > 0
  const canImport =
    isAdmin && !busy && imp.package_id !== '' && imp.site_dest.trim().length > 0

  async function runExport() {
    if (!canExport) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/migration/export', {
        method: 'POST',
        body: JSON.stringify({
          name: exp.name.trim(),
          site_path: exp.site_path.trim(),
          domain: exp.domain.trim(),
          php_version: exp.php_version.trim(),
          db_kind: exp.db_kind,
          db_name: exp.db_kind ? exp.db_name.trim() : '',
        }),
      })
      setFeedback({ kind: 'ok', text: '迁移包已导出' })
      setExp(emptyExport)
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function runImport() {
    if (!canImport) return
    if (
      !window.confirm(
        '导入会覆盖目标站点目录' +
          (imp.import_db ? '及数据库' : '') +
          ',此操作危险且不可恢复。确认继续?',
      )
    )
      return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/migration/import', {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({
          package_id: Number(imp.package_id),
          site_dest: imp.site_dest.trim(),
          import_db: imp.import_db,
          db_name: imp.db_name.trim(),
        }),
      })
      setFeedback({ kind: 'ok', text: '迁移包已导入' })
      setImp(emptyImport)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  // download 经鉴权 fetch 拉取附件(apiFetch 走 JSON 解析,不适用于二进制流)。
  async function download(pkg: Package) {
    setFeedback(null)
    try {
      const t = tokenStore.get()
      const res = await fetch(`/api/m/migration/packages/${pkg.id}/download`, {
        headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pkg.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function remove(pkg: Package) {
    if (!window.confirm(`确认删除迁移包 ${pkg.filename}?`)) return
    setFeedback(null)
    try {
      await apiFetch(`/api/m/migration/packages/${pkg.id}`, { method: 'DELETE' })
      if (imp.package_id === String(pkg.id)) setImp((f) => ({ ...f, package_id: '' }))
      setFeedback({ kind: 'ok', text: '迁移包已删除' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function saveSettings() {
    if (!settings || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<Settings>('/api/m/migration/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setSettings(res)
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

  if (!isAdmin) {
    return (
      <Card>
        <p className="text-sm text-muted">一键迁移需要 admin 角色。</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">导出迁移包</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="迁移包名(可选)"
            placeholder="留空用域名/时间戳"
            value={exp.name}
            onChange={(e) => setExp((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="域名(元信息,可选)"
            placeholder="例如 example.com"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={exp.domain}
            onChange={(e) => setExp((f) => ({ ...f, domain: e.target.value }))}
          />
        </div>
        <Input
          label="站点目录绝对路径 (site_path)"
          placeholder="/www/wwwroot/example.com"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          value={exp.site_path}
          onChange={(e) => setExp((f) => ({ ...f, site_path: e.target.value }))}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="PHP 版本(可选)"
            placeholder="如 8.2"
            value={exp.php_version}
            onChange={(e) => setExp((f) => ({ ...f, php_version: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">数据库类型</span>
            <select
              className={fieldClass}
              value={exp.db_kind}
              onChange={(e) => setExp((f) => ({ ...f, db_kind: e.target.value }))}
            >
              <option value="">不含数据库</option>
              <option value="mysql">MySQL</option>
              <option value="postgres">PostgreSQL</option>
            </select>
          </label>
          <Input
            label="数据库名"
            placeholder={exp.db_kind ? '必填' : '选数据库类型后填写'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={exp.db_name}
            disabled={!exp.db_kind}
            onChange={(e) => setExp((f) => ({ ...f, db_name: e.target.value }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void runExport()} disabled={!canExport}>
            导出
          </Button>
          {busy && <Spinner size={16} />}
        </div>
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">迁移包列表</span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            刷新
          </Button>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && packages.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">{loadErr}</p>
        ) : packages.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">暂无迁移包。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {packages.map((pkg) => (
              <div key={pkg.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{pkg.name}</span>
                    {pkg.db_kind && <Badge status="neutral">{pkg.db_kind}</Badge>}
                    <Badge status="neutral">{fmtBytes(pkg.size)}</Badge>
                  </div>
                  <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                    {pkg.filename}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => void download(pkg)}>
                    下载
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setImp((f) => ({ ...f, package_id: String(pkg.id) }))}
                  >
                    选为导入源
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(pkg)}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4 border border-crit/40">
        <h2 className="text-sm font-medium text-crit">导入迁移包(危险:覆盖目标)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">迁移包</span>
            <select
              className={fieldClass}
              value={imp.package_id}
              onChange={(e) => setImp((f) => ({ ...f, package_id: e.target.value }))}
            >
              <option value="">选择迁移包</option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.filename}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="站点还原目标根目录 (site_dest)"
            placeholder="/www/wwwroot/restored"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-[family-name:var(--font-mono)]"
            value={imp.site_dest}
            onChange={(e) => setImp((f) => ({ ...f, site_dest: e.target.value }))}
          />
        </div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-brand)]"
            checked={imp.import_db}
            onChange={(e) => setImp((f) => ({ ...f, import_db: e.target.checked }))}
          />
          <span className="text-sm text-muted">同时导入包内数据库(覆盖目标库)</span>
        </label>
        {imp.import_db && (
          <Input
            label="目标数据库名(留空用包内元信息)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={imp.db_name}
            onChange={(e) => setImp((f) => ({ ...f, db_name: e.target.value }))}
          />
        )}
        <div>
          <Button variant="danger" onClick={() => void runImport()} disabled={!canImport}>
            导入
          </Button>
        </div>
      </Card>

      {settings && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-text">设置</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['migration_dir', '迁移包暂存目录 (migration_dir)'],
                ['mysqldump', 'mysqldump 路径'],
                ['pgdump', 'pg_dump 路径'],
                ['mysql_cli', 'mysql 客户端路径'],
                ['psql_cli', 'psql 客户端路径'],
              ] as const
            ).map(([key, label]) => (
              <Input
                key={key}
                label={label}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="font-[family-name:var(--font-mono)]"
                value={settings[key]}
                onChange={(e) => setS(key, e.target.value)}
              />
            ))}
          </div>
          <div>
            <Button onClick={() => void saveSettings()} disabled={busy}>
              保存设置
            </Button>
          </div>
        </Card>
      )}

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}
