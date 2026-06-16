import { useCallback, useEffect, useMemo, useState } from 'react'
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

const TABS: { key: Tab; label: string }[] = [
  { key: 'containers', label: '容器' },
  { key: 'images', label: '镜像' },
  { key: 'compose', label: '编排' },
  { key: 'networks', label: '网络' },
  { key: 'volumes', label: '存储卷' },
  { key: 'registries', label: '仓库' },
]

type FeedbackState = { kind: 'ok' | 'err'; text: string } | null

function Feedback({ fb }: { fb: FeedbackState }) {
  if (!fb) return null
  return <p className={`text-sm ${fb.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{fb.text}</p>
}

function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <Card
        className={`flex max-h-[85vh] w-full flex-col gap-3 ${wide ? 'max-w-3xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-medium text-text">{title}</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>
        {children}
      </Card>
    </div>
  )
}

function OutputModal({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} wide>
      <pre className="max-h-[65vh] overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
        {text.trim() || '无输出'}
      </pre>
    </Modal>
  )
}

// 通用列表状态外壳:加载 / 离线未就绪 / 真实错误 / 空 / 内容。
function ListBody({
  loading,
  error,
  empty,
  emptyText,
  children,
}: {
  loading: boolean
  error: string | null
  empty: boolean
  emptyText: string
  children: ReactNode
}) {
  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-8 text-center">
        <p className="text-sm font-medium text-muted">Docker 未就绪</p>
        <p className="text-xs text-faint">{error}</p>
      </div>
    )
  }
  if (empty) {
    return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>
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

function CardHeader({ title, onReload, busy, children }: { title: string; onReload: () => void; busy: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium text-text">{title}</h3>
      <div className="flex items-center gap-1.5">
        {children}
        <Button size="sm" variant="ghost" onClick={onReload} disabled={busy}>刷新</Button>
      </div>
    </div>
  )
}

// --- 容器 ---

type ContainerStats = { cpu: string; mem: string }

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

  async function reloadAll() {
    await reload()
    await loadStats()
  }

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

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title="容器" onReload={() => void reloadAll()} busy={loading || busy} />
      <Feedback fb={fb} />
      <ListBody loading={loading} error={error} empty={rows.length === 0} emptyText="暂无容器。">
        <div className="overflow-x-auto rounded-(--radius-card) border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">名称</th>
                <th className="px-4 py-2.5 font-medium">镜像</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">端口</th>
                <th className="px-4 py-2.5 font-medium">CPU / 内存</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, i) => {
                const id = s(row, 'ID')
                const name = s(row, 'Names', 'Name')
                const ref = name || id
                const state = s(row, 'State', 'Status')
                const st = statsByRef[name]
                const running = stateBadge(state) === 'online'
                const paused = state.toLowerCase().includes('paused')
                return (
                  <tr key={id || i} className="align-top">
                    <td className="px-4 py-3">
                      <span className="block truncate font-medium text-text">{name || id}</span>
                      <span className="block truncate font-[family-name:var(--font-mono)] text-xs text-faint">{id.slice(0, 12)}</span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <span className="block truncate font-[family-name:var(--font-mono)] text-xs text-muted">{s(row, 'Image')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={stateBadge(state)}>{s(row, 'Status') || state || '未知'}</Badge>
                    </td>
                    <td className="max-w-[180px] px-4 py-3">
                      <span className="block truncate font-[family-name:var(--font-mono)] text-xs text-muted">{s(row, 'Ports') || '—'}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-[family-name:var(--font-mono)] text-xs text-muted">
                      {st ? `${st.cpu} / ${st.mem}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {running ? (
                          paused ? (
                            <Button size="sm" variant="ghost" onClick={() => void act(ref, 'unpause')} disabled={!isOperator || busy}>恢复</Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => void act(ref, 'pause')} disabled={!isOperator || busy}>暂停</Button>
                          )
                        ) : null}
                        {running ? (
                          <Button size="sm" variant="ghost" onClick={() => void act(ref, 'stop')} disabled={!isOperator || busy}>停止</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => void act(ref, 'start')} disabled={!isOperator || busy}>启动</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => void act(ref, 'restart')} disabled={!isOperator || busy}>重启</Button>
                        <Button size="sm" variant="ghost" onClick={() => setExecBox({ ref, name })} disabled={!isOperator || busy}>终端</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRename({ ref, name })} disabled={!isOperator || busy}>重命名</Button>
                        <Button size="sm" variant="ghost" onClick={() => setResize({ ref, name })} disabled={!isAdmin || busy}>资源</Button>
                        <Button size="sm" variant="ghost" onClick={() => void show(ref, 'logs')}>日志</Button>
                        <Button size="sm" variant="ghost" onClick={() => void show(ref, 'inspect')}>详情</Button>
                        <Button size="sm" variant="danger" onClick={() => void remove(ref, name)} disabled={!isAdmin || busy}>删除</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
    </Card>
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
    <Modal title={`重命名容器 · ${target.name || target.ref}`} onClose={onClose}>
      <Input label="新名称" value={name} spellCheck={false} autoFocus placeholder="例如 web-1" onChange={(e) => setName(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
        <Button size="sm" onClick={() => void submit()} disabled={busy || !name.trim()}>确定</Button>
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
    <Modal title={`资源限制 · ${target.name || target.ref}`} onClose={onClose}>
      <Input label="内存(docker --memory 语法,如 512m)" value={memory} spellCheck={false} placeholder="留空不改" onChange={(e) => setMemory(e.target.value)} />
      <Input label="CPU(docker --cpus,如 1.5)" value={cpus} spellCheck={false} placeholder="留空不改" onChange={(e) => setCpus(e.target.value)} />
      <p className="text-xs text-warn">危险操作:将带二次确认与 X-Confirm-Danger 提交。</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
        <Button size="sm" variant="danger" onClick={() => void submit()} disabled={busy}>更新</Button>
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
    <Modal title={`在容器内执行 · ${target.name || target.ref}`} onClose={onClose} wide>
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
    </Modal>
  )
}

// --- 镜像 ---

function Images({ isOperator, isAdmin }: { isOperator: boolean; isAdmin: boolean }) {
  const { rows, loading, error, reload } = useDockerList('/api/m/docker/images', isOperator)
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<FeedbackState>(null)
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null)
  const [tagTarget, setTagTarget] = useState<{ ref: string } | null>(null)

  async function pull() {
    const ref = image.trim()
    if (!ref) return
    setBusy(true)
    setFb(null)
    try {
      await mutateText('/api/m/docker/images/pull', { method: 'POST', body: { image: ref } })
      setFb({ kind: 'ok', text: `已拉取 ${ref}` })
      setImage('')
      await reload()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

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

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title="镜像" onReload={() => void reload()} busy={loading || busy}>
        <Button size="sm" variant="ghost" onClick={() => void prune()} disabled={!isAdmin || busy}>清理悬空</Button>
      </CardHeader>
      <div className="flex items-end gap-2">
        <Input label="拉取镜像" className="flex-1" value={image} spellCheck={false} placeholder="例如 nginx:latest" onChange={(e) => setImage(e.target.value)} />
        <Button onClick={() => void pull()} disabled={!isOperator || busy || !image.trim()}>拉取</Button>
      </div>
      <Feedback fb={fb} />
      <ListBody loading={loading} error={error} empty={rows.length === 0} emptyText="暂无镜像。">
        <div className="overflow-x-auto rounded-(--radius-card) border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">镜像</th>
                <th className="px-4 py-2.5 font-medium">大小</th>
                <th className="px-4 py-2.5 font-medium">创建于</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, i) => {
                const repo = s(row, 'Repository')
                const tag = s(row, 'Tag')
                const id = s(row, 'ID')
                const ref = repo && tag && repo !== '<none>' ? `${repo}:${tag}` : id
                return (
                  <tr key={id || i}>
                    <td className="max-w-[320px] px-4 py-3">
                      <span className="block truncate font-[family-name:var(--font-mono)] text-text">{ref}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{s(row, 'Size')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{s(row, 'CreatedSince')}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => void history(ref)}>历史</Button>
                        <Button size="sm" variant="ghost" onClick={() => setTagTarget({ ref })} disabled={!isOperator || busy}>tag</Button>
                        <Button size="sm" variant="danger" onClick={() => void remove(ref)} disabled={!isAdmin || busy}>删除</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ListBody>
      {!isOperator && <p className="text-xs text-muted">拉取/tag 需要 operator 角色;删除与清理需要 admin。</p>}
      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
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
    </Card>
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
    <Modal title={`打 tag · ${source}`} onClose={onClose}>
      <Input label="目标 tag" value={target} spellCheck={false} autoFocus placeholder="例如 myrepo/app:v2" onChange={(e) => setTarget(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
        <Button size="sm" onClick={() => void submit()} disabled={busy || !target.trim()}>确定</Button>
      </div>
    </Modal>
  )
}

// --- 编排(Compose)---

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

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title="编排项目" onReload={() => void reload()} busy={loading || busy} />
      <Feedback fb={fb} />
      <ListBody loading={loading} error={error} empty={rows.length === 0} emptyText="暂无编排项目。">
        <div className="divide-y divide-border rounded-(--radius-card) border border-border">
          {rows.map((row, i) => {
            const name = s(row, 'Name')
            const status = s(row, 'Status')
            return (
              <div key={name || i} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-text">{name}</span>
                  <span className="truncate text-xs text-muted">{status || '—'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => void show(name, 'config')}>配置</Button>
                  <Button size="sm" variant="ghost" onClick={() => void show(name, 'logs')}>日志</Button>
                  <Button size="sm" variant="ghost" onClick={() => void op(name, 'up')} disabled={!isOperator || busy}>up</Button>
                  <Button size="sm" variant="ghost" onClick={() => void op(name, 'restart')} disabled={!isOperator || busy}>重启</Button>
                  <Button size="sm" variant="danger" onClick={() => void op(name, 'down')} disabled={!isAdmin || busy}>down</Button>
                </div>
              </div>
            )
          })}
        </div>
      </ListBody>
      {!isOperator && <p className="text-xs text-muted">up/重启 需要 operator 角色;down 需要 admin。</p>}
      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
    </Card>
  )
}

// --- 网络 / 卷(同构:列表 + 新建 + 详情 + 删除)---

function ResourceList({
  title,
  basePath,
  emptyText,
  createLabel,
  isOperator,
  isAdmin,
  render,
}: {
  title: string
  basePath: string
  emptyText: string
  createLabel: string
  isOperator: boolean
  isAdmin: boolean
  render: (row: DockerRow) => { ref: string; primary: string; secondary: string }
}) {
  const { rows, loading, error, reload } = useDockerList(basePath, isOperator)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<FeedbackState>(null)
  const [name, setName] = useState('')
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null)

  async function create() {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    setFb(null)
    try {
      await mutateText(basePath, { method: 'POST', body: { name: n } })
      setFb({ kind: 'ok', text: `已创建 ${n}` })
      setName('')
      await reload()
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

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

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title={title} onReload={() => void reload()} busy={loading || busy} />
      <div className="flex items-end gap-2">
        <Input label={createLabel} className="flex-1" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
        <Button onClick={() => void create()} disabled={!isOperator || busy || !name.trim()}>新建</Button>
      </div>
      <Feedback fb={fb} />
      <ListBody loading={loading} error={error} empty={rows.length === 0} emptyText={emptyText}>
        <div className="divide-y divide-border rounded-(--radius-card) border border-border">
          {rows.map((row, i) => {
            const r = render(row)
            return (
              <div key={r.ref || i} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-text">{r.primary}</span>
                  <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{r.secondary}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => void inspect(r.ref)}>详情</Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(r.ref)} disabled={!isAdmin || busy}>删除</Button>
                </div>
              </div>
            )
          })}
        </div>
      </ListBody>
      {!isOperator && <p className="text-xs text-muted">新建需要 operator 角色;删除需要 admin。</p>}
      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
    </Card>
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

  if (!isAdmin) {
    return (
      <Card className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-text">仓库</h3>
        <p className="text-sm text-muted">仓库凭证管理需要 admin 角色。</p>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title="镜像仓库" onReload={() => void load()} busy={loading || busy}>
        <Button size="sm" onClick={() => setAdding(true)} disabled={busy}>添加仓库</Button>
      </CardHeader>
      <Feedback fb={fb} />
      <ListBody loading={loading} error={error} empty={rows.length === 0} emptyText="暂无仓库凭证。">
        <div className="divide-y divide-border rounded-(--radius-card) border border-border">
          {rows.map((row, i) => (
            <div key={row.name || i} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-text">{row.name}</span>
                <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{row.server} · {row.username}</span>
              </div>
              <Button size="sm" variant="danger" onClick={() => void remove(row.name)} disabled={busy}>删除</Button>
            </div>
          ))}
        </div>
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
    </Card>
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
    <Modal title="添加镜像仓库" onClose={onClose}>
      <Input label="名称" value={name} spellCheck={false} autoFocus onChange={(e) => setName(e.target.value)} />
      <Input label="服务器地址" value={server} spellCheck={false} placeholder="例如 registry.example.com" onChange={(e) => setServer(e.target.value)} />
      <Input label="用户名" value={username} spellCheck={false} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
      <Input label="密码" type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
      <p className="text-xs text-muted">密码仅用于登录并加密落库,不会回显。</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
        <Button size="sm" onClick={() => void submit()} disabled={busy || !ready}>添加</Button>
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
            basePath="/api/m/docker/networks"
            emptyText="暂无网络。"
            createLabel="新建网络名称"
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
            basePath="/api/m/docker/volumes"
            emptyText="暂无存储卷。"
            createLabel="新建卷名称"
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
      {tabBody}
    </div>
  )
}
