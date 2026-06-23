import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { EmptyState } from '../components/EmptyState'
import { Plus, ShieldCheck, FolderLock, RefreshCw } from 'lucide-react'
import { uid } from '../lib/uid'
import { formatTime } from '../lib/formatTime'

const DANGER = { 'X-Confirm-Danger': '1' }

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

type Feedback = { kind: 'ok' | 'err'; text: string } | null

/** FeedbackBanner 操作反馈条:对齐 Malscan/Ftp 的带边框底色横幅。 */
function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  return (
    <p
      className={`rounded-(--radius-card) border px-3 py-2 text-sm ${
        feedback.kind === 'ok'
          ? 'border-online/40 bg-online/10 text-online'
          : 'border-crit/40 bg-crit/10 text-crit'
      }`}
    >
      {feedback.text}
    </p>
  )
}

interface Settings {
  protected_dirs: string[]
  exclude_rules: string[]
  interval_sec: number
  paused: boolean
}

interface TamperEvent {
  id: number
  path: string
  type: 'added' | 'deleted' | 'modified'
  old_hash: string
  new_hash: string
  detected_at: number
}

const typeLabel: Record<TamperEvent['type'], string> = {
  added: '新增',
  modified: '修改',
  deleted: '删除',
}

function typeBadge(t: TamperEvent['type']): 'online' | 'warn' | 'crit' | 'neutral' {
  if (t === 'added') return 'online'
  if (t === 'modified') return 'warn'
  if (t === 'deleted') return 'crit'
  return 'neutral'
}

// 受保护目录行:后端基线/暂停均为全局,这里把每个 protected_dir 投影成一行,
// id 仅作 React key 与编辑定位,不落库(随 dirs 顺序重新派发)。
interface DirRow {
  id: string
  path: string
}

function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/** Antitamper 防篡改:aaPanel 风格 —— 顶部总开关/状态 + 受保护目录紧凑表 + 添加保护弹窗 + 篡改事件表。 */
export default function Antitamper() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  return (
    <div className="flex flex-col gap-4">
      {isAdmin ? (
        <Control />
      ) : (
        <Card>
          <p className="text-sm text-muted">防篡改配置需要 admin 角色,以下为只读事件列表。</p>
        </Card>
      )}
      <Events />
    </div>
  )
}

function Control() {
  const [cfg, setCfg] = useState<Settings | null>(null)
  const [baselineFiles, setBaselineFiles] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const [adding, setAdding] = useState(false)
  const [addPath, setAddPath] = useState('')
  const [editing, setEditing] = useState<DirRow | null>(null)
  const [editPath, setEditPath] = useState('')

  const [rulesText, setRulesText] = useState('')
  const [intervalText, setIntervalText] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([
        apiFetch<Settings>('/api/m/antitamper/settings'),
        apiFetch<{ files: number }>('/api/m/antitamper/baseline'),
      ])
      setCfg(s)
      setRulesText(s.exclude_rules.join('\n'))
      setIntervalText(String(s.interval_sec))
      setBaselineFiles(b.files)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // putDirs 用最新 dirs 列表整存设置(后端 PUT /settings 取整个 Settings)。
  async function putDirs(dirs: string[]): Promise<boolean> {
    if (!cfg) return false
    setBusy(true)
    setFeedback(null)
    try {
      const next: Settings = { ...cfg, protected_dirs: dirs }
      const saved = await apiFetch<Settings>('/api/m/antitamper/settings', {
        method: 'PUT',
        headers: DANGER,
        body: JSON.stringify(next),
      })
      setCfg(saved)
      return true
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addDir() {
    if (!cfg) return
    const path = addPath.trim()
    if (!path) return
    if (cfg.protected_dirs.includes(path)) {
      setFeedback({ kind: 'err', text: '该目录已在保护列表中' })
      return
    }
    if (await putDirs([...cfg.protected_dirs, path])) {
      setAdding(false)
      setAddPath('')
      setFeedback({ kind: 'ok', text: `已添加保护目录 ${path},建议随后重建基线` })
    }
  }

  async function saveEdit() {
    if (!cfg || !editing) return
    const path = editPath.trim()
    if (!path) return
    const dirs = cfg.protected_dirs.map((d) => (d === editing.path ? path : d))
    if (await putDirs(dirs)) {
      setEditing(null)
      setFeedback({ kind: 'ok', text: '目录已更新,建议随后重建基线' })
    }
  }

  async function removeDir(row: DirRow) {
    if (!cfg) return
    if (!window.confirm(`确认移除保护目录「${row.path}」?该目录将不再被监控,此操作危险。`)) return
    const dirs = cfg.protected_dirs.filter((d) => d !== row.path)
    if (await putDirs(dirs)) {
      setFeedback({ kind: 'ok', text: `已移除 ${row.path}` })
    }
  }

  async function saveRules() {
    if (!cfg) return
    const interval = Number(intervalText)
    if (!Number.isInteger(interval) || interval <= 0) {
      setFeedback({ kind: 'err', text: '扫描间隔须为正整数(秒)' })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      const next: Settings = { ...cfg, exclude_rules: linesOf(rulesText), interval_sec: interval }
      const saved = await apiFetch<Settings>('/api/m/antitamper/settings', {
        method: 'PUT',
        body: JSON.stringify(next),
      })
      setCfg(saved)
      setRulesText(saved.exclude_rules.join('\n'))
      setIntervalText(String(saved.interval_sec))
      setFeedback({ kind: 'ok', text: '规则与间隔已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function rebuild() {
    if (!window.confirm('确认重建基线?当前全部受保护文件的指纹将作为新的可信状态。')) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<{ files: number }>('/api/m/antitamper/baseline', { method: 'POST' })
      setBaselineFiles(res.files)
      setFeedback({ kind: 'ok', text: `基线已重建,共 ${res.files} 个文件` })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function setPaused(paused: boolean) {
    setBusy(true)
    setFeedback(null)
    try {
      const res = await apiFetch<{ paused: boolean }>(
        `/api/m/antitamper/${paused ? 'pause' : 'resume'}`,
        { method: 'POST' },
      )
      setCfg((c) => (c ? { ...c, paused: res.paused } : c))
      setFeedback({ kind: 'ok', text: res.paused ? '监控已暂停' : '监控已恢复' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const rows: DirRow[] = useMemo(
    () => (cfg?.protected_dirs ?? []).map((path) => ({ id: uid(), path })),
    [cfg],
  )
  const ruleCount = cfg?.exclude_rules.length ?? 0
  const protectedOn = !!cfg && !cfg.paused

  const columns: Column<DirRow>[] = useMemo(
    () => [
      {
        key: 'path',
        header: '受保护目录',
        cell: (d) => (
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <FolderLock size={15} className="shrink-0 text-warn" />
            <span className="truncate font-[family-name:var(--font-mono)] text-xs">{d.path}</span>
          </span>
        ),
      },
      {
        key: 'status',
        header: '保护状态',
        width: '110px',
        cell: () => (
          <Badge status={protectedOn ? 'online' : 'warn'}>
            {protectedOn ? '监控中' : '已暂停'}
          </Badge>
        ),
      },
      {
        key: 'rules',
        header: '排除规则',
        width: '110px',
        cell: () => <span className="text-xs text-muted">{ruleCount} 条</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '120px',
        align: 'right',
        cell: (d) => (
          <ActionLinks>
            <ActionLink
              onClick={() => {
                setEditing(d)
                setEditPath(d.path)
                setFeedback(null)
              }}
            >
              编辑
            </ActionLink>
            <ActionLink danger aria-label="移除保护目录" onClick={() => void removeDir(d)}>
              移除
            </ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [protectedOn, ruleCount],
  )

  if (loading) {
    return (
      <Card>
        <div className="flex h-24 items-center justify-center">
          <Spinner size={24} />
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border border-border bg-surface p-5 shadow-[var(--shadow-card),var(--inset-hl)]">
        <div className="flex items-center gap-3">
          <ShieldCheck size={18} className={protectedOn ? 'text-online' : 'text-warn'} />
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-text">防篡改监控</h2>
            {cfg && (
              <Badge status={cfg.paused ? 'warn' : 'online'}>
                {cfg.paused ? '已暂停' : '监控中'}
              </Badge>
            )}
          </div>
          {baselineFiles !== null && (
            <span className="text-xs text-muted">基线 {baselineFiles} 个文件</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {busy && <Spinner size={16} />}
          {cfg?.paused ? (
            <Button size="sm" onClick={() => void setPaused(false)} disabled={busy}>
              恢复监控
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => void setPaused(true)} disabled={busy}>
              暂停监控
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void rebuild()} disabled={busy}>
            <RefreshCw size={14} />
            重建基线
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          size="md"
          disabled={busy}
          onClick={() => {
            setAddPath('')
            setFeedback(null)
            setAdding(true)
          }}
        >
          <Plus size={15} />
          添加保护
        </Button>
        <span className="text-xs text-muted">改目录或排除规则后建议重建基线。</span>
      </div>

      <FeedbackBanner feedback={feedback} />

      <Table
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        emptyText={
          <EmptyState
            icon={<FolderLock />}
            title="还没有受保护目录"
            hint="点击「添加保护」纳入第一个目录,再重建基线。"
          />
        }
      />

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">扫描规则</h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">排除规则(每行一个 glob)</span>
          <textarea
            value={rulesText}
            rows={3}
            spellCheck={false}
            placeholder="*.log"
            onChange={(e) => setRulesText(e.target.value)}
            className="rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          />
        </label>
        <Input
          label="扫描间隔(秒)"
          inputMode="numeric"
          value={intervalText}
          onChange={(e) => setIntervalText(e.target.value)}
        />
        <div>
          <Button onClick={() => void saveRules()} disabled={busy}>
            保存规则
          </Button>
        </div>
      </Card>

      {adding && (
        <Modal title="添加保护目录" size="sm" onClose={() => setAdding(false)}>
          <div className="flex flex-col gap-4">
            <Input
              label="目录路径"
              placeholder="/www/wwwroot"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoFocus
              className="font-[family-name:var(--font-mono)]"
              value={addPath}
              onChange={(e) => setAddPath(e.target.value)}
            />
            <p className="text-xs text-muted">须为绝对且干净的路径(后端校验),如 /www/wwwroot。</p>
            <FeedbackBanner feedback={feedback?.kind === 'err' ? feedback : null} />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
                取消
              </Button>
              <Button onClick={() => void addDir()} disabled={!addPath.trim() || busy}>
                {busy && <Spinner size={14} />}
                添加
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title="编辑保护目录" size="sm" onClose={() => setEditing(null)}>
          <div className="flex flex-col gap-4">
            <Input
              label="目录路径"
              placeholder="/www/wwwroot"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoFocus
              className="font-[family-name:var(--font-mono)]"
              value={editPath}
              onChange={(e) => setEditPath(e.target.value)}
            />
            <FeedbackBanner feedback={feedback?.kind === 'err' ? feedback : null} />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                取消
              </Button>
              <Button onClick={() => void saveEdit()} disabled={!editPath.trim() || busy}>
                {busy && <Spinner size={14} />}
                保存
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Events() {
  const [events, setEvents] = useState<TamperEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setEvents(await apiFetch<TamperEvent[]>('/api/m/antitamper/events?limit=200'))
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const columns: Column<TamperEvent>[] = useMemo(
    () => [
      {
        key: 'type',
        header: '类型',
        width: '88px',
        cell: (ev) => <Badge status={typeBadge(ev.type)}>{typeLabel[ev.type] ?? ev.type}</Badge>,
      },
      {
        key: 'path',
        header: '路径',
        cell: (ev) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-text">
            {ev.path}
          </span>
        ),
      },
      {
        key: 'detected',
        header: '检出时间',
        width: '160px',
        align: 'right',
        cell: (ev) => <span className="text-xs text-muted">{formatTime(ev.detected_at)}</span>,
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text">篡改事件</h2>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          刷新
        </Button>
      </div>
      {loading ? (
        <div className="h-32 animate-pulse rounded-(--radius-card) border border-border bg-surface" />
      ) : loadErr && events.length === 0 ? (
        <p className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {loadErr}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      ) : (
        <Table
          columns={columns}
          rows={events}
          rowKey={(ev) => ev.id}
          emptyText={
            <EmptyState
              icon={<ShieldCheck />}
              title="暂无篡改事件"
              hint="受保护目录一旦发生变更,会在此列出。"
            />
          }
        />
      )}
    </div>
  )
}
