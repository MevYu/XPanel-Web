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


// docker CLI `{{json .}}` 字段名随版本略有差异,统一用宽松索引签名读取。
type DockerRow = Record<string, unknown>

function s(row: DockerRow, key: string): string {
  const v = row[key]
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

// 文本端点(inspect/logs)走原始 fetch:apiFetch 强制 JSON.parse,纯文本会抛错。
async function fetchText(path: string): Promise<string> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    headers: t ? { Authorization: `Bearer ${t.access}` } : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
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
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

function stateBadge(state: string): 'online' | 'warn' | 'crit' | 'neutral' {
  const v = state.toLowerCase()
  if (v.includes('running') || v.includes('up')) return 'online'
  if (v.includes('paused') || v.includes('restart')) return 'warn'
  if (v.includes('exited') || v.includes('dead')) return 'crit'
  return 'neutral'
}

type Tab = 'containers' | 'images' | 'compose' | 'networks' | 'volumes' | 'settings'

const TABS: { key: Tab; label: string }[] = [
  { key: 'containers', label: '容器' },
  { key: 'images', label: '镜像' },
  { key: 'compose', label: 'Compose' },
  { key: 'networks', label: '网络' },
  { key: 'volumes', label: '卷' },
  { key: 'settings', label: '设置' },
]

function Feedback({ fb }: { fb: { kind: 'ok' | 'err'; text: string } | null }) {
  if (!fb) return null
  return <p className={`text-sm ${fb.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{fb.text}</p>
}

function OutputModal({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <Card className="flex max-h-[80vh] w-full max-w-3xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-medium text-text">{title}</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>
        <pre className="max-h-[60vh] overflow-auto rounded-(--radius-card) bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
          {text.trim() || '无输出'}
        </pre>
      </Card>
    </div>
  )
}

function useDockerList(path: string, canRead: boolean) {
  const [rows, setRows] = useState<DockerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false)
      return
    }
    setError(null)
    setLoading(true)
    try {
      setRows(await apiFetch<DockerRow[]>(path))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [path, canRead])

  useEffect(() => {
    void load()
  }, [load])

  return { rows, loading, error, reload: load }
}

function Containers({ isOperator, isAdmin }: { isOperator: boolean; isAdmin: boolean }) {
  const { rows, loading, error, reload } = useDockerList('/api/m/docker/containers', isOperator)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null)

  async function act(ref: string, verb: 'start' | 'stop' | 'restart') {
    setBusy(true)
    setFb(null)
    try {
      await mutateText(`/api/m/docker/containers/${encodeURIComponent(ref)}/${verb}`, { method: 'POST' })
      setFb({ kind: 'ok', text: `已对容器执行 ${verb}` })
      await reload()
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
      await reload()
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
      setModal({ title: `${ref} · ${kind}`, text: await fetchText(path) })
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">容器</h3>
        <Button size="sm" variant="ghost" onClick={() => void reload()} disabled={loading || busy}>刷新</Button>
      </div>
      <Feedback fb={fb} />
      {loading ? (
        <div className="flex h-24 items-center justify-center"><Spinner size={20} /></div>
      ) : error ? (
        <p className="text-sm text-muted">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">暂无容器。</p>
      ) : (
        <div className="divide-y divide-border rounded-(--radius-card) border border-border">
          {rows.map((row, i) => {
            const id = s(row, 'ID')
            const ref = id || s(row, 'Names')
            const name = s(row, 'Names')
            const state = s(row, 'State') || s(row, 'Status')
            return (
              <div key={id || i} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-text">{name || id}</span>
                  <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                    {s(row, 'Image')} · {s(row, 'Status')}
                  </span>
                </div>
                <Badge status={stateBadge(state)}>{state || '未知'}</Badge>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => void show(ref, 'logs')}>日志</Button>
                  <Button size="sm" variant="ghost" onClick={() => void show(ref, 'inspect')}>详情</Button>
                  <Button size="sm" variant="ghost" onClick={() => void act(ref, 'start')} disabled={!isOperator || busy}>启动</Button>
                  <Button size="sm" variant="ghost" onClick={() => void act(ref, 'stop')} disabled={!isOperator || busy}>停止</Button>
                  <Button size="sm" variant="ghost" onClick={() => void act(ref, 'restart')} disabled={!isOperator || busy}>重启</Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(ref, name)} disabled={!isAdmin || busy}>删除</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!isOperator && <p className="text-xs text-muted">容器管理需要 operator 角色;删除需要 admin。</p>}
      {modal && <OutputModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
    </Card>
  )
}

function Images({ isOperator, isAdmin }: { isOperator: boolean; isAdmin: boolean }) {
  const { rows, loading, error, reload } = useDockerList('/api/m/docker/images', isOperator)
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

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

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">镜像</h3>
        <Button size="sm" variant="ghost" onClick={() => void reload()} disabled={loading || busy}>刷新</Button>
      </div>
      <div className="flex items-end gap-2">
        <Input label="拉取镜像" className="flex-1" value={image} spellCheck={false}
          placeholder="例如 nginx:latest" onChange={(e) => setImage(e.target.value)} />
        <Button onClick={() => void pull()} disabled={!isOperator || busy || !image.trim()}>拉取</Button>
      </div>
      <Feedback fb={fb} />
      {loading ? (
        <div className="flex h-24 items-center justify-center"><Spinner size={20} /></div>
      ) : error ? (
        <p className="text-sm text-muted">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">暂无镜像。</p>
      ) : (
        <div className="divide-y divide-border rounded-(--radius-card) border border-border">
          {rows.map((row, i) => {
            const repo = s(row, 'Repository')
            const tag = s(row, 'Tag')
            const id = s(row, 'ID')
            const ref = repo && tag && repo !== '<none>' ? `${repo}:${tag}` : id
            return (
              <div key={id || i} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-[family-name:var(--font-mono)] text-sm text-text">{ref}</span>
                  <span className="truncate text-xs text-muted">{s(row, 'Size')} · {s(row, 'CreatedSince')}</span>
                </div>
                <Button size="sm" variant="danger" onClick={() => void remove(ref)} disabled={!isAdmin || busy}>删除</Button>
              </div>
            )
          })}
        </div>
      )}
      {!isOperator && <p className="text-xs text-muted">拉取需要 operator 角色;删除需要 admin。</p>}
    </Card>
  )
}

function Compose({ isOperator, isAdmin }: { isOperator: boolean; isAdmin: boolean }) {
  const { rows, loading, error, reload } = useDockerList('/api/m/docker/compose', isOperator)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function op(project: string, verb: 'up' | 'down') {
    if (verb === 'down' && !window.confirm(`确认停止并移除 compose 项目「${project}」?`)) return
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

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">Compose 项目</h3>
        <Button size="sm" variant="ghost" onClick={() => void reload()} disabled={loading || busy}>刷新</Button>
      </div>
      <Feedback fb={fb} />
      {loading ? (
        <div className="flex h-24 items-center justify-center"><Spinner size={20} /></div>
      ) : error ? (
        <p className="text-sm text-muted">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">暂无 compose 项目。</p>
      ) : (
        <div className="divide-y divide-border rounded-(--radius-card) border border-border">
          {rows.map((row, i) => {
            const name = s(row, 'Name')
            const status = s(row, 'Status')
            return (
              <div key={name || i} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-text">{name}</span>
                  <span className="truncate text-xs text-muted">{status}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void op(name, 'up')} disabled={!isOperator || busy}>up</Button>
                <Button size="sm" variant="danger" onClick={() => void op(name, 'down')} disabled={!isAdmin || busy}>down</Button>
              </div>
            )
          })}
        </div>
      )}
      {!isOperator && <p className="text-xs text-muted">up 需要 operator 角色;down 需要 admin。</p>}
    </Card>
  )
}

function ReadonlyList({ title, path, canRead, render }: {
  title: string
  path: string
  canRead: boolean
  render: (row: DockerRow) => { primary: string; secondary: string }
}) {
  const { rows, loading, error, reload } = useDockerList(path, canRead)
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">{title}</h3>
        <Button size="sm" variant="ghost" onClick={() => void reload()} disabled={loading}>刷新</Button>
      </div>
      {loading ? (
        <div className="flex h-24 items-center justify-center"><Spinner size={20} /></div>
      ) : error ? (
        <p className="text-sm text-muted">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">暂无数据。</p>
      ) : (
        <div className="divide-y divide-border rounded-(--radius-card) border border-border">
          {rows.map((row, i) => {
            const r = render(row)
            return (
              <div key={i} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="truncate text-sm font-medium text-text">{r.primary}</span>
                <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">{r.secondary}</span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

interface DockerSettings {
  compose_dir: string
  docker_root: string
}

function Settings({ isAdmin }: { isAdmin: boolean }) {
  const [form, setForm] = useState<DockerSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setForm(await apiFetch<DockerSettings>('/api/m/docker/settings'))
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!form) return
    setBusy(true)
    setFb(null)
    try {
      setForm(await apiFetch<DockerSettings>('/api/m/docker/settings', { method: 'PUT', body: JSON.stringify(form) }))
      setFb({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFb({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  if (loading || !form) {
    return <Card className="flex h-32 items-center justify-center"><Spinner size={24} /></Card>
  }

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-text">设置</h3>
      <Input label="Compose 项目目录" value={form.compose_dir} spellCheck={false}
        onChange={(e) => setForm({ ...form, compose_dir: e.target.value })} />
      <Input label="Docker 数据根目录" value={form.docker_root} spellCheck={false}
        onChange={(e) => setForm({ ...form, docker_root: e.target.value })} />
      <div className="flex items-center gap-2">
        <Button onClick={() => void save()} disabled={!isAdmin || busy}>保存</Button>
        {busy && <Spinner size={16} />}
      </div>
      {!isAdmin && <p className="text-xs text-muted">设置需要 admin 角色。</p>}
      <Feedback fb={fb} />
    </Card>
  )
}

/** Docker 容器:容器/镜像/Compose/网络/卷管理与设置,危险操作走二次确认与确认头。 */
export default function Docker() {
  const { role } = useAuth()
  const isOperator = role === 'admin' || role === 'operator'
  const isAdmin = role === 'admin'
  const [tab, setTab] = useState<Tab>('containers')

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

      {tab === 'containers' && <Containers isOperator={isOperator} isAdmin={isAdmin} />}
      {tab === 'images' && <Images isOperator={isOperator} isAdmin={isAdmin} />}
      {tab === 'compose' && <Compose isOperator={isOperator} isAdmin={isAdmin} />}
      {tab === 'networks' && (
        <ReadonlyList title="网络" path="/api/m/docker/networks" canRead={isOperator}
          render={(row) => ({ primary: s(row, 'Name'), secondary: `${s(row, 'Driver')} · ${s(row, 'Scope')} · ${s(row, 'ID')}` })} />
      )}
      {tab === 'volumes' && (
        <ReadonlyList title="卷" path="/api/m/docker/volumes" canRead={isOperator}
          render={(row) => ({ primary: s(row, 'Name'), secondary: `${s(row, 'Driver')} · ${s(row, 'Mountpoint')}` })} />
      )}
      {tab === 'settings' && <Settings isAdmin={isAdmin} />}
    </div>
  )
}
