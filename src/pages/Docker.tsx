import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Spinner'
import { Table, ActionLink, ActionLinks, type Column } from '../components/Table'
import { uid } from '../lib/uid'
import { Container, Layers, GitBranch, Network, HardDrive, KeyRound, Plus, Download, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

// 列表端点在 docker daemon 不可用时返回 502(后端 runJSONLines 失败)。
// 把这类错误识别为「离线/未就绪」,展示空态而非把原始报错抛给用户。
function isOffline(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : ''
  return (
    msg.includes('502') ||
    msg.includes('bad gateway') ||
    msg.includes('docker command failed') ||
    msg.includes('unavailable') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror')
  )
}

// docker CLI `{{json .}}` 字段名随版本略有差异,统一用宽松索引签名读取。
type DockerRow = Record<string, unknown>

function s(row: DockerRow, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key]
    if (v != null && v !== '') return typeof v === 'string' ? v : String(v)
  }
  return ''
}

// 文本端点(inspect/logs/config)走原始 fetch:apiFetch 强制 JSON.parse,纯文本会抛错。
async function fetchText(path: string): Promise<string> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.text()
}

// 写操作端点返回 text/plain(docker 命令输出):apiFetch 强制 JSON.parse 会在成功时抛错,改用裸 fetch。
async function mutateText(
  path: string,
  opts: { method: 'POST' | 'DELETE'; danger?: boolean; body?: unknown },
): Promise<string> {
  const t = tokenStore.get()
  const headers: Record<string, string> = {}
  if (t) headers.Authorization = `Bearer ${t.access}`
  if (opts.danger) headers['X-Confirm-Danger'] = '1'
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.text()
}

function stateBadge(state: string): 'online' | 'warn' | 'crit' | 'neutral' {
  const v = state.toLowerCase()
  if (v.includes('running') || v.includes('up')) return 'online'
  if (v.includes('paused') || v.includes('restart')) return 'warn'
  if (v.includes('exited') || v.includes('dead')) return 'crit'
  return 'neutral'
}

type Tab = 'containers' | 'images' | 'compose' | 'networks' | 'volumes' | 'registries'

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'containers', label: '容器', icon: Container },
  { key: 'images', label: '镜像', icon: Layers },
  { key: 'compose', label: '编排', icon: GitBranch },
  { key: 'networks', label: '网络', icon: Network },
  { key: 'volumes', label: '存储卷', icon: HardDrive },
  { key: 'registries', label: '仓库', icon: KeyRound },
]

type FeedbackState = { kind: 'ok' | 'err'; text: string } | null

function Feedback({ fb }: { fb: FeedbackState }) {
  if (!fb) return null
  return <p className={`text-sm ${fb.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{fb.text}</p>
}

function OutputModal({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} size="lg">
      <pre className="h-full rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
        {text.trim() || '无输出'}
      </pre>
    </Modal>
  )
}

// 工具栏:左上主操作 + 右上刷新;标题带暖色图标。
function Toolbar({
  icon: Icon,
  title,
  count,
  onReload,
  busy,
  children,
}: {
  icon: LucideIcon
  title: string
  count?: number
  onReload: () => void
  busy: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-warn" />
        <h3 className="text-sm font-medium text-text">{title}</h3>
        {count != null && count > 0 && <span className="text-xs text-muted">· {count}</span>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <Button size="sm" variant="ghost" onClick={onReload} disabled={busy}>刷新</Button>
      </div>
    </div>
  )
}

// 通用列表外壳:加载 / 离线未就绪 / 真实错误时不渲染表格(优雅空态/离线态);
// daemon 在线时把渲染交给 Table(其自带内联空态)。
function ListBody({
  loading,
  error,
  children,
}: {
  loading: boolean
  error: string | null
  children: ReactNode
}) {
  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center rounded-(--radius-card) border border-border bg-surface">
        <Spinner size={20} />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-(--radius-card) border border-border bg-surface py-10 text-center">
        <p className="text-sm font-medium text-text">Docker 未就绪</p>
        <p className="text-xs text-muted">{error}</p>
      </div>
    )
  }
  return <>{children}</>
}

function useDockerList(path: string, canRead: boolean) {
  const [rows, setRows] = useState<DockerRow[]>([])
  const [loading, setLoading] = useState(true)
  // error 非空 = 离线/未就绪;daemon 在线但列表为空时 error 为 null、rows 为 []。
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<DockerRow[]>(path)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setRows([])
      setError(isOffline(e) ? 'Docker daemon 未连接或当前环境不可用。' : errorText(e))
    } finally {
      setLoading(false)
    }
  }, [path, canRead])

  useEffect(() => {
    void load()
  }, [load])

  return { rows, loading, error, reload: load }
}

// --- 容器 ---

type ContainerStats = { cpu: string; mem: string }
type ContainerView = DockerRow & { _key: string }

function Containers({ isOperator, isAdmin }: { isOperator: boolean; isAdmin: boolean }) {
  const { rows, loading, error, reload } = useDockerList('/api/m/docker/containers', isOperator)
  const [statsByRef, setStatsByRef] = useState<Record<string, ContainerStats>>({})
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<FeedbackState>(null)
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null)
  const [rename, setRename] = useState<{ ref: string; name: string } | null>(null)
  const [resize, setResize] = useState<{ ref: string; name: string } | null>(null)
  const [execBox, setExecBox] = useState<{ ref: string; name: string } | null>(null)

  const loadStats = useCallback(async () => {
    if (!isOperator) return
    try {
      const data = await apiFetch<DockerRow[]>('/api/m/docker/containers/stats')
      const map: Record<string, ContainerStats> = {}
      for (const row of data) {
        // stats 行的 Name 是容器名;用名字归并到列表行。
        const key = s(row, 'Name', 'Container')
        if (key) map[key] = { cpu: s(row, 'CPUPerc'), mem: s(row, 'MemPerc', 'MemUsage') }
      }
      setStatsByRef(map)
    } catch {
      // stats 不可用不影响主列表渲染,静默忽略。
      setStatsByRef({})
    }
  }, [isOperator])

  useEffect(() => {
    if (!loading && !error) void loadStats()
  }, [loading, error, loadStats])

  const reloadAll = useCallback(async () => {
    await reload()
    await loadStats()
  }, [reload, loadStats])

  async function act(ref: string, verb: 'start' | 'stop' | 'restart' | 'pause' | 'unpause') {
    setBusy(true)
    setFb(null)
    try {
      await mutateText(`/api/m/docker/containers/${encodeURIComponent(ref)}/${verb}`, { method: 'POST' })
      setFb({ kind: 'ok', text: `已对容器执行 ${verb}` })
      await reloadAll()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(ref: string, name: string) {
    if (!window.confirm(`确认删除容器「${name || ref}」?将强制移除(-f)。`)) return
    setBusy(true)
    setFb(null)
    try {
      await mutateText(`/api/m/docker/containers/${encodeURIComponent(ref)}`, { method: 'DELETE', danger: true })
      setFb({ kind: 'ok', text: '容器已删除' })
      await reloadAll()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function show(ref: string, kind: 'inspect' | 'logs') {
    setFb(null)
    try {
      const path =
        kind === 'inspect'
          ? `/api/m/docker/containers/${encodeURIComponent(ref)}/inspect`
          : `/api/m/docker/containers/${encodeURIComponent(ref)}/logs?tail=200`
      setModal({ title: `${ref} · ${kind === 'inspect' ? '详情' : '日志'}`, text: await fetchText(path) })
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    }
  }

  const data: ContainerView[] = useMemo(
    () => rows.map((row) => ({ ...row, _key: s(row, 'ID') || uid() })),
    [rows],
  )

  const columns: Column<ContainerView>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '名称',
        cell: (row) => {
          const id = s(row, 'ID')
          const name = s(row, 'Names', 'Name')
          return (
            <div className="flex flex-col gap-0.5">
              <span className="truncate font-medium text-text">{name || id}</span>
              <span className="truncate font-[family-name:var(--font-mono)] text-xs text-faint">{id.slice(0, 12)}</span>
            </div>
          )
        },
      },
      {
        key: 'image',
        header: '镜像',
        cell: (row) => (
          <span className="block max-w-[200px] truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {s(row, 'Image')}
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        width: '120px',
        cell: (row) => {
          const state = s(row, 'State', 'Status')
          return <Badge status={stateBadge(state)}>{s(row, 'Status') || state || '未知'}</Badge>
        },
      },
      {
        key: 'ports',
        header: '端口',
        cell: (row) => (
          <span className="block max-w-[160px] truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {s(row, 'Ports') || '—'}
          </span>
        ),
      },
      {
        key: 'usage',
        header: 'CPU / 内存',
        width: '130px',
        cell: (row) => {
          const st = statsByRef[s(row, 'Names', 'Name')]
          return (
            <span className="whitespace-nowrap font-[family-name:var(--font-mono)] text-xs text-muted">
              {st ? `${st.cpu} / ${st.mem}` : '—'}
            </span>
          )
        },
      },
      {
        key: 'actions',
        header: '操作',
        align: 'right',
        cell: (row) => {
          const id = s(row, 'ID')
          const name = s(row, 'Names', 'Name')
          const ref = name || id
          const state = s(row, 'State', 'Status')
          const running = stateBadge(state) === 'online'
          const paused = state.toLowerCase().includes('paused')
          return (
            <ActionLinks>
              {running ? (
                paused ? (
                  <ActionLink disabled={!isOperator || busy} onClick={() => void act(ref, 'unpause')}>恢复</ActionLink>
                ) : (
                  <ActionLink disabled={!isOperator || busy} onClick={() => void act(ref, 'pause')}>暂停</ActionLink>
                )
              ) : null}
              {running ? (
                <ActionLink disabled={!isOperator || busy} onClick={() => void act(ref, 'stop')}>停止</ActionLink>
              ) : (
                <ActionLink disabled={!isOperator || busy} onClick={() => void act(ref, 'start')}>启动</ActionLink>
              )}
              <ActionLink disabled={!isOperator || busy} onClick={() => void act(ref, 'restart')}>重启</ActionLink>
              <ActionLink disabled={!isOperator || busy} onClick={() => setExecBox({ ref, name })}>终端</ActionLink>
              <ActionLink disabled={!isOperator || busy} onClick={() => setRename({ ref, name })}>重命名</ActionLink>
              <ActionLink disabled={!isAdmin || busy} onClick={() => setResize({ ref, name })}>资源</ActionLink>
              <ActionLink onClick={() => void show(ref, 'logs')}>日志</ActionLink>
              <ActionLink onClick={() => void show(ref, 'inspect')}>详情</ActionLink>
              <ActionLink danger disabled={!isAdmin || busy} onClick={() => void remove(ref, name)}>删除</ActionLink>
            </ActionLinks>
          )
        },
      },
    ],
    [statsByRef, isOperator, isAdmin, busy],
  )

  return (
    <div className="flex flex-col gap-3">
      <Toolbar icon={Container} title="容器" count={rows.length} onReload={() => void reloadAll()} busy={loading || busy} />
      <Feedback fb={fb} />
      <ListBody loading={loading} error={error}>
        <Table columns={columns} rows={data} rowKey={(r) => r._key} emptyText="暂无容器。" />
      </ListBody>
      {!isOperator && <p className="text-xs text-muted">容器管理需要 operator 角色;删除与资源限制需要 admin。</p>}
      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
      {rename && (
        <RenameModal
          target={rename}
          onClose={() => setRename(null)}
          onDone={(text) => {
            setRename(null)
            setFb({ kind: 'ok', text })
            void reloadAll()
          }}
          onError={(text) => setFb({ kind: 'err', text })}
        />
      )}
      {resize && (
        <ResizeModal
          target={resize}
          onClose={() => setResize(null)}
          onDone={(text) => {
            setResize(null)
            setFb({ kind: 'ok', text })
            void reloadAll()
          }}
          onError={(text) => setFb({ kind: 'err', text })}
        />
      )}
      {execBox && <ExecModal target={execBox} onClose={() => setExecBox(null)} />}
    </div>
  )
}

function RenameModal({
  target,
  onClose,
  onDone,
  onError,
}: {
  target: { ref: string; name: string }
  onClose: () => void
  onDone: (text: string) => void
  onError: (text: string) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const next = name.trim()
    if (!next) return
    setBusy(true)
    try {
      await mutateText(`/api/m/docker/containers/${encodeURIComponent(target.ref)}/rename`, {
        method: 'POST',
        body: { name: next },
      })
      onDone(`已重命名为 ${next}`)
    } catch (e) {
      onError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={`重命名容器 · ${target.name || target.ref}`} onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <Input label="新名称" value={name} spellCheck={false} autoFocus placeholder="例如 web-1" onChange={(e) => setName(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !name.trim()}>确定</Button>
        </div>
      </div>
    </Modal>
  )
}

function ResizeModal({
  target,
  onClose,
  onDone,
  onError,
}: {
  target: { ref: string; name: string }
  onClose: () => void
  onDone: (text: string) => void
  onError: (text: string) => void
}) {
  const [memory, setMemory] = useState('')
  const [cpus, setCpus] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const mem = memory.trim()
    const cpu = cpus.trim()
    if (!mem && !cpu) {
      onError('内存与 CPU 至少填一项。')
      return
    }
    if (!window.confirm(`确认调整容器「${target.name || target.ref}」的资源限制?这是危险操作。`)) return
    setBusy(true)
    try {
      await mutateText(`/api/m/docker/containers/${encodeURIComponent(target.ref)}/update`, {
        method: 'POST',
        danger: true,
        body: { memory: mem, cpus: cpu },
      })
      onDone('资源限制已更新')
    } catch (e) {
      onError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={`资源限制 · ${target.name || target.ref}`} onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <Input label="内存(docker --memory 语法,如 512m)" value={memory} spellCheck={false} placeholder="留空不改" onChange={(e) => setMemory(e.target.value)} />
        <Input label="CPU(docker --cpus,如 1.5)" value={cpus} spellCheck={false} placeholder="留空不改" onChange={(e) => setCpus(e.target.value)} />
        <p className="text-xs text-warn">危险操作:将带二次确认与 X-Confirm-Danger 提交。</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
          <Button size="sm" variant="danger" onClick={() => void submit()} disabled={busy}>更新</Button>
        </div>
      </div>
    </Modal>
  )
}

function ExecModal({ target, onClose }: { target: { ref: string; name: string }; onClose: () => void }) {
  const [cmd, setCmd] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    // 简单按空格拆分为参数数组(无 shell);引号/转义不在范围内。
    const parts = cmd.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return
    setBusy(true)
    setErr(null)
    try {
      const text = await mutateText(`/api/m/docker/containers/${encodeURIComponent(target.ref)}/exec`, {
        method: 'POST',
        body: { cmd: parts },
      })
      setOut(text)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`在容器内执行 · ${target.name || target.ref}`} onClose={onClose} size="lg">
      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <Input
            label="命令(空格分隔参数,不经 shell)"
            className="flex-1"
            value={cmd}
            spellCheck={false}
            autoFocus
            placeholder="例如 ls -la /"
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) void run()
            }}
          />
          <Button onClick={() => void run()} disabled={busy || !cmd.trim()}>执行</Button>
        </div>
        {err && <p className="text-sm text-crit">{err}</p>}
        {out != null && (
          <pre className="max-h-[50vh] overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
            {out.trim() || '无输出'}
          </pre>
        )}
      </div>
    </Modal>
  )
}

// --- 镜像 ---

type ImageView = DockerRow & { _key: string; _ref: string }

function Images({ isOperator, isAdmin }: { isOperator: boolean; isAdmin: boolean }) {
  const { rows, loading, error, reload } = useDockerList('/api/m/docker/images', isOperator)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<FeedbackState>(null)
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null)
  const [tagTarget, setTagTarget] = useState<{ ref: string } | null>(null)
  const [pulling, setPulling] = useState(false)

  async function remove(ref: string) {
    if (!window.confirm(`确认删除镜像「${ref}」?`)) return
    setBusy(true)
    setFb(null)
    try {
      await mutateText(`/api/m/docker/images/${encodeURIComponent(ref)}`, { method: 'DELETE', danger: true })
      setFb({ kind: 'ok', text: '镜像已删除' })
      await reload()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function prune() {
    if (!window.confirm('确认清理悬空镜像(dangling)?这是危险操作。')) return
    setBusy(true)
    setFb(null)
    try {
      const out = await mutateText('/api/m/docker/images/prune', { method: 'POST', danger: true })
      setModal({ title: '清理悬空镜像', text: out })
      setFb({ kind: 'ok', text: '已清理悬空镜像' })
      await reload()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function history(ref: string) {
    setFb(null)
    try {
      const data = await apiFetch<DockerRow[]>(`/api/m/docker/images/${encodeURIComponent(ref)}/history`)
      const text = (Array.isArray(data) ? data : [])
        .map((row) => `${s(row, 'ID').slice(0, 12)}  ${s(row, 'Size').padStart(8)}  ${s(row, 'CreatedSince')}\n${s(row, 'CreatedBy')}`)
        .join('\n\n')
      setModal({ title: `${ref} · 历史`, text })
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    }
  }

  const data: ImageView[] = useMemo(
    () =>
      rows.map((row) => {
        const repo = s(row, 'Repository')
        const tag = s(row, 'Tag')
        const id = s(row, 'ID')
        const ref = repo && tag && repo !== '<none>' ? `${repo}:${tag}` : id
        return { ...row, _key: id || uid(), _ref: ref }
      }),
    [rows],
  )

  const columns: Column<ImageView>[] = useMemo(
    () => [
      {
        key: 'ref',
        header: '镜像',
        cell: (row) => (
          <span className="block max-w-[320px] truncate font-[family-name:var(--font-mono)] text-text">{row._ref}</span>
        ),
      },
      {
        key: 'size',
        header: '大小',
        width: '110px',
        cell: (row) => <span className="whitespace-nowrap text-xs text-muted">{s(row, 'Size')}</span>,
      },
      {
        key: 'created',
        header: '创建于',
        width: '150px',
        cell: (row) => <span className="whitespace-nowrap text-xs text-muted">{s(row, 'CreatedSince')}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '170px',
        align: 'right',
        cell: (row) => (
          <ActionLinks>
            <ActionLink onClick={() => void history(row._ref)}>历史</ActionLink>
            <ActionLink disabled={!isOperator || busy} onClick={() => setTagTarget({ ref: row._ref })}>tag</ActionLink>
            <ActionLink danger disabled={!isAdmin || busy} onClick={() => void remove(row._ref)}>删除</ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isOperator, isAdmin, busy],
  )

  return (
    <div className="flex flex-col gap-3">
      <Toolbar icon={Layers} title="镜像" count={rows.length} onReload={() => void reload()} busy={loading || busy}>
        <Button size="sm" disabled={!isOperator || busy} onClick={() => setPulling(true)}>
          <Download size={14} />
          拉取镜像
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void prune()} disabled={!isAdmin || busy}>
          <Trash2 size={14} />
          清理悬空
        </Button>
      </Toolbar>
      <Feedback fb={fb} />
      <ListBody loading={loading} error={error}>
        <Table columns={columns} rows={data} rowKey={(r) => r._key} emptyText="暂无镜像。" />
      </ListBody>
      {!isOperator && <p className="text-xs text-muted">拉取/tag 需要 operator 角色;删除与清理需要 admin。</p>}
      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
      {pulling && (
        <PullModal
          onClose={() => setPulling(false)}
          onDone={(text) => {
            setPulling(false)
            setFb({ kind: 'ok', text })
            void reload()
          }}
          onError={(text) => setFb({ kind: 'err', text })}
        />
      )}
      {tagTarget && (
        <TagModal
          source={tagTarget.ref}
          onClose={() => setTagTarget(null)}
          onDone={(text) => {
            setTagTarget(null)
            setFb({ kind: 'ok', text })
            void reload()
          }}
          onError={(text) => setFb({ kind: 'err', text })}
        />
      )}
    </div>
  )
}

function PullModal({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void
  onDone: (text: string) => void
  onError: (text: string) => void
}) {
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const ref = image.trim()
    if (!ref) return
    setBusy(true)
    try {
      await mutateText('/api/m/docker/images/pull', { method: 'POST', body: { image: ref } })
      onDone(`已拉取 ${ref}`)
    } catch (e) {
      onError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="拉取镜像" onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <Input
          label="镜像引用"
          value={image}
          spellCheck={false}
          autoFocus
          placeholder="例如 nginx:latest"
          onChange={(e) => setImage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) void submit()
          }}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !image.trim()}>拉取</Button>
        </div>
      </div>
    </Modal>
  )
}

function TagModal({
  source,
  onClose,
  onDone,
  onError,
}: {
  source: string
  onClose: () => void
  onDone: (text: string) => void
  onError: (text: string) => void
}) {
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const t = target.trim()
    if (!t) return
    setBusy(true)
    try {
      await mutateText(`/api/m/docker/images/${encodeURIComponent(source)}/tag`, { method: 'POST', body: { target: t } })
      onDone(`已打 tag ${t}`)
    } catch (e) {
      onError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={`打 tag · ${source}`} onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <Input label="目标 tag" value={target} spellCheck={false} autoFocus placeholder="例如 myrepo/app:v2" onChange={(e) => setTarget(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !target.trim()}>确定</Button>
        </div>
      </div>
    </Modal>
  )
}

// --- 编排(Compose)---

type ComposeView = DockerRow & { _key: string }

function Compose({ isOperator, isAdmin }: { isOperator: boolean; isAdmin: boolean }) {
  const { rows, loading, error, reload } = useDockerList('/api/m/docker/compose', isOperator)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<FeedbackState>(null)
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null)

  async function op(project: string, verb: 'up' | 'restart' | 'down') {
    if (verb === 'down' && !window.confirm(`确认停止并移除编排项目「${project}」?这是危险操作。`)) return
    setBusy(true)
    setFb(null)
    try {
      await mutateText(`/api/m/docker/compose/${encodeURIComponent(project)}/${verb}`, {
        method: 'POST',
        danger: verb === 'down',
      })
      setFb({ kind: 'ok', text: `已对 ${project} 执行 ${verb}` })
      await reload()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function show(project: string, kind: 'config' | 'logs') {
    setFb(null)
    try {
      const path =
        kind === 'config'
          ? `/api/m/docker/compose/${encodeURIComponent(project)}/config`
          : `/api/m/docker/compose/${encodeURIComponent(project)}/logs?tail=200`
      setModal({ title: `${project} · ${kind === 'config' ? '配置' : '日志'}`, text: await fetchText(path) })
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    }
  }

  const data: ComposeView[] = useMemo(
    () => rows.map((row) => ({ ...row, _key: s(row, 'Name') || uid() })),
    [rows],
  )

  const columns: Column<ComposeView>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '项目',
        cell: (row) => <span className="truncate font-medium text-text">{s(row, 'Name')}</span>,
      },
      {
        key: 'status',
        header: '状态',
        cell: (row) => <span className="truncate text-xs text-muted">{s(row, 'Status') || '—'}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        width: '220px',
        align: 'right',
        cell: (row) => {
          const name = s(row, 'Name')
          return (
            <ActionLinks>
              <ActionLink onClick={() => void show(name, 'config')}>配置</ActionLink>
              <ActionLink onClick={() => void show(name, 'logs')}>日志</ActionLink>
              <ActionLink disabled={!isOperator || busy} onClick={() => void op(name, 'up')}>up</ActionLink>
              <ActionLink disabled={!isOperator || busy} onClick={() => void op(name, 'restart')}>重启</ActionLink>
              <ActionLink danger disabled={!isAdmin || busy} onClick={() => void op(name, 'down')}>down</ActionLink>
            </ActionLinks>
          )
        },
      },
    ],
    [isOperator, isAdmin, busy],
  )

  return (
    <div className="flex flex-col gap-3">
      <Toolbar icon={GitBranch} title="编排项目" count={rows.length} onReload={() => void reload()} busy={loading || busy} />
      <Feedback fb={fb} />
      <ListBody loading={loading} error={error}>
        <Table columns={columns} rows={data} rowKey={(r) => r._key} emptyText="暂无编排项目。" />
      </ListBody>
      {!isOperator && <p className="text-xs text-muted">up/重启 需要 operator 角色;down 需要 admin。</p>}
      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
    </div>
  )
}

// --- 网络 / 卷(同构:列表 + 新建 + 详情 + 删除)---

type ResourceView = { ref: string; primary: string; secondary: string; _key: string }

function ResourceList({
  title,
  icon,
  basePath,
  emptyText,
  createTitle,
  createLabel,
  isOperator,
  isAdmin,
  render,
}: {
  title: string
  icon: LucideIcon
  basePath: string
  emptyText: string
  createTitle: string
  createLabel: string
  isOperator: boolean
  isAdmin: boolean
  render: (row: DockerRow) => { ref: string; primary: string; secondary: string }
}) {
  const { rows, loading, error, reload } = useDockerList(basePath, isOperator)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<FeedbackState>(null)
  const [creating, setCreating] = useState(false)
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null)

  async function remove(ref: string) {
    if (!window.confirm(`确认删除「${ref}」?这是危险操作。`)) return
    setBusy(true)
    setFb(null)
    try {
      await mutateText(`${basePath}/${encodeURIComponent(ref)}`, { method: 'DELETE', danger: true })
      setFb({ kind: 'ok', text: '已删除' })
      await reload()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function inspect(ref: string) {
    setFb(null)
    try {
      setModal({ title: `${ref} · 详情`, text: await fetchText(`${basePath}/${encodeURIComponent(ref)}/inspect`) })
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    }
  }

  const data: ResourceView[] = useMemo(
    () =>
      rows.map((row) => {
        const r = render(row)
        return { ...r, _key: r.ref || uid() }
      }),
    [rows, render],
  )

  const columns: Column<ResourceView>[] = useMemo(
    () => [
      {
        key: 'primary',
        header: '名称',
        cell: (row) => <span className="truncate font-medium text-text">{row.primary}</span>,
      },
      {
        key: 'secondary',
        header: '详情',
        cell: (row) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{row.secondary}</span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '120px',
        align: 'right',
        cell: (row) => (
          <ActionLinks>
            <ActionLink onClick={() => void inspect(row.ref)}>详情</ActionLink>
            <ActionLink danger disabled={!isAdmin || busy} onClick={() => void remove(row.ref)}>删除</ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [isAdmin, busy],
  )

  return (
    <div className="flex flex-col gap-3">
      <Toolbar icon={icon} title={title} count={rows.length} onReload={() => void reload()} busy={loading || busy}>
        <Button size="sm" disabled={!isOperator || busy} onClick={() => setCreating(true)}>
          <Plus size={14} />
          新建
        </Button>
      </Toolbar>
      <Feedback fb={fb} />
      <ListBody loading={loading} error={error}>
        <Table columns={columns} rows={data} rowKey={(r) => r._key} emptyText={emptyText} />
      </ListBody>
      {!isOperator && <p className="text-xs text-muted">新建需要 operator 角色;删除需要 admin。</p>}
      {creating && (
        <ResourceCreateModal
          title={createTitle}
          label={createLabel}
          basePath={basePath}
          onClose={() => setCreating(false)}
          onDone={(text) => {
            setCreating(false)
            setFb({ kind: 'ok', text })
            void reload()
          }}
          onError={(text) => setFb({ kind: 'err', text })}
        />
      )}
      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
    </div>
  )
}

function ResourceCreateModal({
  title,
  label,
  basePath,
  onClose,
  onDone,
  onError,
}: {
  title: string
  label: string
  basePath: string
  onClose: () => void
  onDone: (text: string) => void
  onError: (text: string) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      await mutateText(basePath, { method: 'POST', body: { name: n } })
      onDone(`已创建 ${n}`)
    } catch (e) {
      onError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <Input
          label={label}
          value={name}
          spellCheck={false}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) void submit()
          }}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !name.trim()}>新建</Button>
        </div>
      </div>
    </Modal>
  )
}

// --- 仓库 ---

interface RegistryRow {
  name: string
  server: string
  username: string
  created_at?: number
}

function Registries({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<RegistryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<FeedbackState>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<RegistryRow[]>('/api/m/docker/registries')
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setRows([])
      setError(isOffline(e) ? 'Docker daemon 未连接或当前环境不可用。' : errorText(e))
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(name: string) {
    if (!window.confirm(`确认删除仓库凭证「${name}」?这是危险操作。`)) return
    setBusy(true)
    setFb(null)
    try {
      await mutateText(`/api/m/docker/registries/${encodeURIComponent(name)}`, { method: 'DELETE', danger: true })
      setFb({ kind: 'ok', text: '已删除' })
      await load()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<RegistryRow>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '名称',
        cell: (row) => <span className="truncate font-medium text-text">{row.name}</span>,
      },
      {
        key: 'server',
        header: '服务器 · 用户名',
        cell: (row) => (
          <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
            {row.server} · {row.username}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        width: '90px',
        align: 'right',
        cell: (row) => (
          <ActionLinks>
            <ActionLink danger disabled={busy} onClick={() => void remove(row.name)}>删除</ActionLink>
          </ActionLinks>
        ),
      },
    ],
    [busy],
  )

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <KeyRound size={16} className="text-warn" />
          <h3 className="text-sm font-medium text-text">仓库</h3>
        </div>
        <p className="text-sm text-muted">仓库凭证管理需要 admin 角色。</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Toolbar icon={KeyRound} title="镜像仓库" count={rows.length} onReload={() => void load()} busy={loading || busy}>
        <Button size="sm" disabled={busy} onClick={() => setAdding(true)}>
          <Plus size={14} />
          添加仓库
        </Button>
      </Toolbar>
      <Feedback fb={fb} />
      <ListBody loading={loading} error={error}>
        <Table columns={columns} rows={rows} rowKey={(r) => r.name} emptyText="暂无仓库凭证。" />
      </ListBody>
      {adding && (
        <RegistryModal
          onClose={() => setAdding(false)}
          onDone={(text) => {
            setAdding(false)
            setFb({ kind: 'ok', text })
            void load()
          }}
          onError={(text) => setFb({ kind: 'err', text })}
        />
      )}
    </div>
  )
}

function RegistryModal({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void
  onDone: (text: string) => void
  onError: (text: string) => void
}) {
  const [name, setName] = useState('')
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const ready = name.trim() && server.trim() && username.trim() && password

  async function submit() {
    if (!ready) return
    setBusy(true)
    try {
      await mutateText('/api/m/docker/registries', {
        method: 'POST',
        body: { name: name.trim(), server: server.trim(), username: username.trim(), password },
      })
      onDone(`已添加仓库 ${name.trim()}`)
    } catch (e) {
      onError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="添加镜像仓库" onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <Input label="名称" value={name} spellCheck={false} autoFocus onChange={(e) => setName(e.target.value)} />
        <Input label="服务器地址" value={server} spellCheck={false} placeholder="例如 registry.example.com" onChange={(e) => setServer(e.target.value)} />
        <Input label="用户名" value={username} spellCheck={false} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
        <Input label="密码" type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
        <p className="text-xs text-muted">密码仅用于登录并加密落库,不会回显。</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !ready}>添加</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Docker 容器:容器/镜像/编排/网络/存储卷/仓库的多 tab 管理,危险操作走二次确认与 X-Confirm-Danger 头。 */
export default function Docker() {
  const { role } = useAuth()
  const isOperator = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'
  const [tab, setTab] = useState<Tab>('containers')

  const tabBody = useMemo(() => {
    switch (tab) {
      case 'containers':
        return <Containers isOperator={isOperator} isAdmin={isAdmin} />
      case 'images':
        return <Images isOperator={isOperator} isAdmin={isAdmin} />
      case 'compose':
        return <Compose isOperator={isOperator} isAdmin={isAdmin} />
      case 'networks':
        return (
          <ResourceList
            title="网络"
            icon={Network}
            basePath="/api/m/docker/networks"
            emptyText="暂无网络。"
            createTitle="新建网络"
            createLabel="网络名称"
            isOperator={isOperator}
            isAdmin={isAdmin}
            render={(row) => ({
              ref: s(row, 'Name', 'ID'),
              primary: s(row, 'Name'),
              secondary: `${s(row, 'Driver')} · ${s(row, 'Scope')} · ${s(row, 'ID').slice(0, 12)}`,
            })}
          />
        )
      case 'volumes':
        return (
          <ResourceList
            title="存储卷"
            icon={HardDrive}
            basePath="/api/m/docker/volumes"
            emptyText="暂无存储卷。"
            createTitle="新建存储卷"
            createLabel="卷名称"
            isOperator={isOperator}
            isAdmin={isAdmin}
            render={(row) => ({
              ref: s(row, 'Name'),
              primary: s(row, 'Name'),
              secondary: `${s(row, 'Driver')} · ${s(row, 'Mountpoint')}`,
            })}
          />
        )
      case 'registries':
        return <Registries isAdmin={isAdmin} />
    }
  }, [tab, isOperator, isAdmin])

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">Docker</h1>
        <p className="text-xs text-muted">容器 / 镜像 / 编排 / 网络 / 存储卷 / 仓库,危险操作走二次确认。</p>
      </header>

      <div className="flex flex-wrap gap-1 rounded-(--radius-card) border border-border bg-surface p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-(--radius-card) px-3 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                tab === t.key ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2/60 hover:text-text'
              }`}
            >
              <Icon size={14} className={tab === t.key ? 'text-warn' : ''} />
              {t.label}
            </button>
          )
        })}
      </div>
      {tabBody}
    </div>
  )
}
