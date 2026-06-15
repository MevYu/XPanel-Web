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

function fmtTime(unix: number | null): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

const DANGER = { 'X-Confirm-Danger': '1' }
type Feedback = { kind: 'ok' | 'err'; text: string } | null

interface Task {
  id: number
  root: string
  status: string
  files_scanned: number
  files_skipped: number
  flagged_count: number
  error: string
  started_by: number | null
  started_at: number
  finished_at: number | null
}

interface Hit {
  id: number
  task_id: number
  path: string
  score: number
  rule_id: string
  rule: string
  line: number
  excerpt: string
  quarantined: boolean
}

interface Quarantine {
  id: number
  orig_path: string
  stored_path: string
  quarantined_by: number | null
  quarantined_at: number
  restored: boolean
}

interface RuleView {
  id: string
  name: string
  score: number
  pattern: string
}

interface Settings {
  scan_dir: string
  quarantine_dir: string
  max_file_size: number
  max_files: number
  score_to_flag: number
}

function statusBadge(status: string): 'online' | 'warn' | 'crit' | 'neutral' {
  if (status === 'done') return 'online'
  if (status === 'running') return 'warn'
  if (status === 'failed') return 'crit'
  return 'neutral'
}

/** Malscan 木马查杀:发起扫描、任务列表与命中详情、隔离/还原/白名单、规则与设置。 */
export default function Malscan() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  return (
    <div className="flex flex-col gap-4">
      <Scanner canWrite={canWrite} />
      <Tasks isAdmin={isAdmin} canWrite={canWrite} />
      <Quarantines isAdmin={isAdmin} />
      <Whitelist canWrite={canWrite} />
      {isAdmin && <SettingsCard />}
      <Rules />
    </div>
  )
}

function Scanner({ canWrite }: { canWrite: boolean }) {
  const [dir, setDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function scan() {
    if (!canWrite || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const task = await apiFetch<Task>('/api/m/malscan/scan', {
        method: 'POST',
        body: JSON.stringify({ dir: dir.trim() }),
      })
      setFeedback({
        kind: 'ok',
        text: `扫描 #${task.id} 完成:扫描 ${task.files_scanned} 文件,命中 ${task.flagged_count}`,
      })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">发起扫描</h2>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="子目录(相对扫描根,留空扫全部)"
          placeholder="例如 wwwroot/site1"
          value={dir}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          onChange={(e) => setDir(e.target.value)}
        />
        <Button onClick={() => void scan()} disabled={!canWrite || busy}>
          开始扫描
        </Button>
        {busy && <Spinner size={16} />}
      </div>
      {!canWrite && <p className="text-xs text-muted">发起扫描需要 operator 及以上角色。</p>}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function Tasks({ isAdmin, canWrite }: { isAdmin: boolean; canWrite: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setTasks(await apiFetch<Task[]>('/api/m/malscan/tasks'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card className="flex flex-col gap-4 p-0">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="text-sm font-medium text-text">扫描任务</h2>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          刷新
        </Button>
      </div>
      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : loadErr && tasks.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">{loadErr}</p>
      ) : tasks.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">暂无扫描任务。</p>
      ) : (
        <div className="divide-y divide-border px-5 pb-2">
          {tasks.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge status={statusBadge(t.status)}>{t.status}</Badge>
                <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">
                  {t.root}
                </span>
                <span className="text-xs text-muted">
                  扫描 {t.files_scanned} · 跳过 {t.files_skipped} · 命中 {t.flagged_count}
                </span>
                <span className="ml-auto text-xs text-muted">{fmtTime(t.started_at)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenId(openId === t.id ? null : t.id)}
                >
                  {openId === t.id ? '收起命中' : '查看命中'}
                </Button>
              </div>
              {t.error && <p className="text-xs text-crit">{t.error}</p>}
              {openId === t.id && <Hits taskId={t.id} isAdmin={isAdmin} canWrite={canWrite} />}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function Hits({ taskId, isAdmin }: { taskId: number; isAdmin: boolean; canWrite: boolean }) {
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setHits(await apiFetch<Hit[]>(`/api/m/malscan/tasks/${taskId}/hits`))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  async function quarantine(path: string) {
    if (!window.confirm(`确认隔离文件 ${path}?文件将被移入隔离区,此操作危险。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/malscan/quarantine', {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({ path }),
      })
      setFeedback({ kind: 'ok', text: '已隔离' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-16 items-center justify-center">
        <Spinner size={18} />
      </div>
    )
  }
  if (loadErr) return <p className="text-xs text-muted">{loadErr}</p>
  if (hits.length === 0) return <p className="text-xs text-muted">该任务无命中。</p>

  return (
    <div className="flex flex-col gap-2 rounded-(--radius-card) bg-surface-2 p-3">
      {hits.map((h) => (
        <div key={h.id} className="flex flex-col gap-1 border-b border-border pb-2 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status="crit">分值 {h.score}</Badge>
            <span className="text-xs text-muted">{h.rule}</span>
            <span className="text-xs text-muted">行 {h.line}</span>
            {h.quarantined && <Badge status="warn">已隔离</Badge>}
            {isAdmin && !h.quarantined && (
              <Button
                size="sm"
                variant="danger"
                className="ml-auto"
                onClick={() => void quarantine(h.path)}
                disabled={busy}
              >
                隔离
              </Button>
            )}
          </div>
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">{h.path}</span>
          <code className="break-all rounded bg-bg px-2 py-1 font-[family-name:var(--font-mono)] text-xs text-muted">
            {h.excerpt}
          </code>
        </div>
      ))}
      {feedback && (
        <p className={`text-xs ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}

function Quarantines({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Quarantine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setItems(await apiFetch<Quarantine[]>('/api/m/malscan/quarantine'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function restore(q: Quarantine) {
    if (!window.confirm(`确认还原 ${q.orig_path}?文件将移回原位,此操作危险。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/malscan/restore', {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({ path: q.orig_path }),
      })
      setFeedback({ kind: 'ok', text: '已还原' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-0">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="text-sm font-medium text-text">隔离区</h2>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          刷新
        </Button>
      </div>
      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : loadErr && items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">{loadErr}</p>
      ) : items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">隔离区为空。</p>
      ) : (
        <div className="divide-y divide-border px-5 pb-2">
          {items.map((q) => (
            <div key={q.id} className="flex items-center gap-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">
                  {q.orig_path}
                </span>
                <span className="text-xs text-muted">隔离于 {fmtTime(q.quarantined_at)}</span>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void restore(q)}
                disabled={!isAdmin || busy}
                title={isAdmin ? undefined : '需要 admin 角色'}
              >
                还原
              </Button>
            </div>
          ))}
        </div>
      )}
      {feedback && (
        <p className={`px-5 pb-4 text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function Whitelist({ canWrite }: { canWrite: boolean }) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function mutate(method: 'POST' | 'DELETE') {
    const p = path.trim()
    if (!p || !canWrite || busy) return
    if (method === 'DELETE' && !window.confirm(`确认从白名单移除 ${p}?`)) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/malscan/whitelist', { method, body: JSON.stringify({ path: p }) })
      setFeedback({ kind: 'ok', text: method === 'POST' ? '已加入白名单' : '已移出白名单' })
      setPath('')
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">扫描白名单</h2>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="路径(相对扫描根)"
          placeholder="例如 wwwroot/known_good.php"
          value={path}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          onChange={(e) => setPath(e.target.value)}
        />
        <Button onClick={() => void mutate('POST')} disabled={!canWrite || !path.trim() || busy}>
          加入
        </Button>
        <Button
          variant="danger"
          onClick={() => void mutate('DELETE')}
          disabled={!canWrite || !path.trim() || busy}
        >
          移除
        </Button>
        {busy && <Spinner size={16} />}
      </div>
      {!canWrite && <p className="text-xs text-muted">白名单操作需要 operator 及以上角色。</p>}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function SettingsCard() {
  const [cfg, setCfg] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    try {
      setCfg(await apiFetch<Settings>('/api/m/malscan/settings'))
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
    if (!cfg) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/malscan/settings', { method: 'PUT', body: JSON.stringify(cfg) })
      setFeedback({ kind: 'ok', text: '设置已保存' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">扫描设置</h2>
      {loading ? (
        <div className="flex h-16 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : cfg ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="扫描根目录"
              value={cfg.scan_dir}
              spellCheck={false}
              className="font-[family-name:var(--font-mono)]"
              onChange={(e) => setCfg((c) => (c ? { ...c, scan_dir: e.target.value } : c))}
            />
            <Input
              label="隔离区目录"
              value={cfg.quarantine_dir}
              spellCheck={false}
              className="font-[family-name:var(--font-mono)]"
              onChange={(e) => setCfg((c) => (c ? { ...c, quarantine_dir: e.target.value } : c))}
            />
            <Input
              label="单文件大小上限(字节)"
              inputMode="numeric"
              value={String(cfg.max_file_size)}
              onChange={(e) =>
                setCfg((c) => (c ? { ...c, max_file_size: Number(e.target.value) || 0 } : c))
              }
            />
            <Input
              label="单次扫描文件数上限"
              inputMode="numeric"
              value={String(cfg.max_files)}
              onChange={(e) => setCfg((c) => (c ? { ...c, max_files: Number(e.target.value) || 0 } : c))}
            />
            <Input
              label="判定可疑的累计分阈值"
              inputMode="numeric"
              value={String(cfg.score_to_flag)}
              onChange={(e) =>
                setCfg((c) => (c ? { ...c, score_to_flag: Number(e.target.value) || 0 } : c))
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void save()} disabled={busy}>
              保存
            </Button>
            {busy && <Spinner size={16} />}
          </div>
        </>
      ) : null}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  )
}

function Rules() {
  const [rules, setRules] = useState<RuleView[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<RuleView[]>('/api/m/malscan/rules')
      .then(setRules)
      .catch((e) => setLoadErr(errorText(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card className="flex flex-col gap-4 p-0">
      <h2 className="px-5 pt-5 text-sm font-medium text-text">检测规则</h2>
      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : loadErr ? (
        <p className="px-5 pb-5 text-sm text-muted">{loadErr}</p>
      ) : (
        <div className="divide-y divide-border px-5 pb-2">
          {rules.map((r) => (
            <div key={r.id} className="flex flex-col gap-1 py-3">
              <div className="flex items-center gap-2">
                <Badge status={r.score >= 10 ? 'crit' : r.score >= 5 ? 'warn' : 'neutral'}>
                  分值 {r.score}
                </Badge>
                <span className="text-sm text-text">{r.name}</span>
              </div>
              <code className="break-all font-[family-name:var(--font-mono)] text-xs text-muted">
                {r.pattern}
              </code>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
