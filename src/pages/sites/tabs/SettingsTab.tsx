import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Input } from '../../../components/Input'
import { Plus, X } from 'lucide-react'
import {
  type Site,
  type Limits,
  type ErrorPage,
  DANGER,
  errorText,
  fieldClass,
  ERROR_CODES,
} from '../shared'
import { TabSection, SaveBar, Feedback, useTabResource } from '../tabui'

/** SettingsTab 设置:运行目录(非反代)+ 访问限制 + 自定义错误页。 */
export function SettingsTab({
  site,
  canWrite,
  isAdmin,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  isAdmin: boolean
  onChanged: (s: Site) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {site.kind !== 'proxy' && (
        <RootSection site={site} isAdmin={isAdmin} onChanged={onChanged} />
      )}
      <LimitsSection site={site} canWrite={canWrite} />
      <ErrorPagesSection site={site} canWrite={canWrite} onChanged={onChanged} />
    </div>
  )
}

/** RootSection 修改运行(根)目录,危险操作:改根目录需 admin + 确认 + 确认头。 */
function RootSection({
  site,
  isAdmin,
  onChanged,
}: {
  site: Site
  isAdmin: boolean
  onChanged: (s: Site) => void
}) {
  const [root, setRoot] = useState(site.root_dir)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function save() {
    if (!isAdmin || !root.trim()) return
    if (!window.confirm(`确认把站点根目录改为「${root.trim()}」?改错会导致站点无法访问,此操作危险。`)) return
    setBusy(true)
    setMsg(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/root`, {
        method: 'PUT',
        headers: DANGER,
        body: JSON.stringify({ root_dir: root.trim() }),
      })
      onChanged(updated)
      setMsg({ kind: 'ok', text: '运行目录已更新' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="运行目录" desc="站点的根目录。修改需 admin 角色,改错会导致站点 404。">
      <Input
        label="根目录绝对路径"
        placeholder="/www/wwwroot/example.com"
        value={root}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="font-[family-name:var(--font-mono)]"
        disabled={!isAdmin}
        onChange={(e) => setRoot(e.target.value)}
      />
      <Feedback msg={msg} />
      {isAdmin ? (
        <SaveBar onSave={() => void save()} busy={busy} disabled={!root.trim()} label="修改根目录" />
      ) : (
        <p className="text-xs text-muted">修改运行目录需要 admin 角色。</p>
      )}
    </TabSection>
  )
}

/** LimitsSection 访问限制:限速 KB/s 与并发限连(0 = 关闭)。 */
function LimitsSection({ site, canWrite }: { site: Site; canWrite: boolean }) {
  const { data, loading } = useTabResource<Limits>(`/api/m/sites/sites/${site.id}/limits`, {
    rate_kb: 0,
    conn: 0,
  })
  const [rate, setRate] = useState(0)
  const [conn, setConn] = useState(0)
  const [synced, setSynced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (!loading && !synced) {
    setRate(data.rate_kb)
    setConn(data.conn)
    setSynced(true)
  }

  async function save() {
    if (!canWrite) return
    setBusy(true)
    setMsg(null)
    try {
      await apiFetch(`/api/m/sites/sites/${site.id}/limits`, {
        method: 'PUT',
        body: JSON.stringify({ rate_kb: Math.max(0, rate), conn: Math.max(0, conn) }),
      })
      setMsg({ kind: 'ok', text: '访问限制已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="访问限制" desc="0 表示不限制。限速针对单连接,限连针对单 IP 并发。">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="限速 (KB/s)"
          type="number"
          min={0}
          value={String(rate)}
          disabled={!canWrite || loading}
          onChange={(e) => setRate(Number(e.target.value) || 0)}
        />
        <Input
          label="并发连接数"
          type="number"
          min={0}
          value={String(conn)}
          disabled={!canWrite || loading}
          onChange={(e) => setConn(Number(e.target.value) || 0)}
        />
      </div>
      <Feedback msg={msg} />
      {canWrite && <SaveBar onSave={() => void save()} busy={busy} disabled={loading} />}
    </TabSection>
  )
}

/** ErrorPagesSection 自定义错误页:码(白名单)→ 路径(以 / 开头)列表整体 PUT。 */
function ErrorPagesSection({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data, loading } = useTabResource<ErrorPage[]>(
    `/api/m/sites/sites/${site.id}/error-pages`,
    [],
  )
  const [rows, setRows] = useState<ErrorPage[]>([])
  const [synced, setSynced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (!loading && !synced) {
    setRows(data ?? [])
    setSynced(true)
  }

  const valid = rows.every((r) => r.path.trim().startsWith('/'))

  async function save() {
    if (!canWrite || !valid) return
    setBusy(true)
    setMsg(null)
    try {
      const error_pages = rows.map((r) => ({ code: r.code, path: r.path.trim() }))
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/error-pages`, {
        method: 'PUT',
        body: JSON.stringify({ error_pages }),
      })
      onChanged(updated)
      setMsg({ kind: 'ok', text: '自定义错误页已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="自定义错误页" desc="为指定 HTTP 状态码返回站内页面,路径相对站点根,以 / 开头。">
      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-xs text-muted">使用 nginx 默认错误页。</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={r.code}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, code: Number(e.target.value) } : x)))
              }
              disabled={!canWrite}
              className={`${fieldClass} w-24`}
            >
              {ERROR_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="text-muted">→</span>
            <input
              value={r.path}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)))
              }
              placeholder="/40x.html"
              spellCheck={false}
              disabled={!canWrite}
              className={`${fieldClass} min-w-40 flex-1 font-[family-name:var(--font-mono)]`}
            />
            <button
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              disabled={!canWrite}
              aria-label="移除错误页"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-crit/10 hover:text-crit disabled:cursor-not-allowed disabled:opacity-30"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => setRows((rs) => [...rs, { code: 404, path: '' }])}
        disabled={!canWrite}
        className="inline-flex w-fit items-center gap-1.5 rounded-(--radius-card) border border-dashed border-border px-3 py-2 text-sm text-muted transition hover:border-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={14} />
        添加错误页
      </button>
      <Feedback msg={msg} />
      {canWrite && <SaveBar onSave={() => void save()} busy={busy} disabled={!valid} />}
    </TabSection>
  )
}
