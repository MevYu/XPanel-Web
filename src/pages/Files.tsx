import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, tokenStore } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import { formatBytes } from '../lib/format'
import type { DirEntry, Share } from '../api/types'

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

function fmtTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString()
}

// joinPath 拼接当前目录与名字,规范化 slash(根目录为空串)。
function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

function parentPath(dir: string): string {
  const i = dir.lastIndexOf('/')
  return i < 0 ? '' : dir.slice(0, i)
}

// 带 Bearer 的原始 fetch,用于二进制下载与 multipart 上传(不能走强制 JSON 头的 apiFetch)。
function authHeaders(): Record<string, string> {
  const t = tokenStore.get()
  return t ? { Authorization: `Bearer ${t.access}` } : {}
}

export default function Files() {
  const { role } = useAuth()
  const canWrite = role === 'admin' || role === 'operator'

  const [cwd, setCwd] = useState('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const [editing, setEditing] = useState<{ path: string; text: string } | null>(null)
  const [sharing, setSharing] = useState<{ path: string; isDir: boolean } | null>(null)
  const [showShares, setShowShares] = useState(false)

  const load = useCallback(async (path: string) => {
    setLoading(true)
    setErr(null)
    try {
      const data = await apiFetch<DirEntry[]>(
        `/api/m/files/list?path=${encodeURIComponent(path)}`,
      )
      data.sort((a, b) =>
        a.is_dir === b.is_dir ? a.name.localeCompare(b.name) : a.is_dir ? -1 : 1,
      )
      setEntries(data)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(cwd)
  }, [cwd, load])

  function flash(text: string) {
    setNotice(text)
    setErr(null)
  }

  async function refresh() {
    await load(cwd)
  }

  async function download(entry: DirEntry) {
    try {
      const res = await fetch(
        `/api/m/files/download?path=${encodeURIComponent(joinPath(cwd, entry.name))}`,
        { headers: authHeaders() },
      )
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = entry.name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function openEditor(entry: DirEntry) {
    try {
      const res = await fetch(
        `/api/m/files/read?path=${encodeURIComponent(joinPath(cwd, entry.name))}`,
        { headers: authHeaders() },
      )
      if (!res.ok) throw new Error(await res.text())
      setEditing({ path: joinPath(cwd, entry.name), text: await res.text() })
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function saveEditor() {
    if (!editing) return
    try {
      await apiFetch(`/api/m/files/write?path=${encodeURIComponent(editing.path)}`, {
        method: 'POST',
        body: editing.text,
      })
      setEditing(null)
      flash('已保存')
      await refresh()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function upload(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`/api/m/files/upload?path=${encodeURIComponent(cwd)}`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      })
      if (!res.ok) throw new Error(await res.text())
      flash(`已上传 ${file.name}`)
      await refresh()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function mkdir() {
    const name = window.prompt('新建文件夹名称')
    if (!name) return
    try {
      await apiFetch(`/api/m/files/mkdir?path=${encodeURIComponent(joinPath(cwd, name))}`, {
        method: 'POST',
      })
      flash('已创建文件夹')
      await refresh()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function rename(entry: DirEntry) {
    const next = window.prompt('重命名为', entry.name)
    if (!next || next === entry.name) return
    try {
      await apiFetch('/api/m/files/rename', {
        method: 'POST',
        body: JSON.stringify({ from: joinPath(cwd, entry.name), to: joinPath(cwd, next) }),
      })
      flash('已重命名')
      await refresh()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function remove(entry: DirEntry) {
    if (!window.confirm(`确认删除「${entry.name}」?${entry.is_dir ? '目录将递归删除。' : ''}`)) return
    try {
      await apiFetch(`/api/m/files/delete?path=${encodeURIComponent(joinPath(cwd, entry.name))}`, {
        method: 'POST',
      })
      flash('已删除')
      await refresh()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  async function chmod(entry: DirEntry) {
    const mode = window.prompt(`设置 ${entry.name} 的权限(八进制,如 0644)`, '0644')
    if (!mode) return
    try {
      await apiFetch('/api/m/files/chmod', {
        method: 'POST',
        body: JSON.stringify({ path: joinPath(cwd, entry.name), mode }),
      })
      flash('权限已修改')
      await refresh()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  const crumbs = cwd ? cwd.split('/') : []

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <button
            className="rounded px-1.5 py-0.5 text-brand hover:bg-surface-2"
            onClick={() => setCwd('')}
          >
            根目录
          </button>
          {crumbs.map((seg, i) => {
            const target = crumbs.slice(0, i + 1).join('/')
            return (
              <span key={target} className="flex items-center gap-1">
                <span className="text-muted">/</span>
                <button
                  className="rounded px-1.5 py-0.5 text-brand hover:bg-surface-2"
                  onClick={() => setCwd(target)}
                >
                  {seg}
                </button>
              </span>
            )
          })}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            刷新
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowShares((v) => !v)}>
            分享列表
          </Button>
          {canWrite && (
            <>
              <Button size="sm" variant="ghost" onClick={() => void mkdir()}>
                新建文件夹
              </Button>
              <Button size="sm" onClick={() => fileInput.current?.click()}>
                上传
              </Button>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void upload(f)
                  e.target.value = ''
                }}
              />
            </>
          )}
        </div>
      </Card>

      {notice && <p className="text-sm text-online">{notice}</p>}

      <Card className="p-0">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : err ? (
          <p className="p-5 text-sm text-crit">{err}</p>
        ) : (
          <div className="divide-y divide-border">
            {cwd && (
              <button
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm text-muted hover:bg-surface-2"
                onClick={() => setCwd(parentPath(cwd))}
              >
                <span className="font-[family-name:var(--font-mono)]">..</span>
                <span>上级目录</span>
              </button>
            )}
            {entries.length === 0 && !cwd && (
              <p className="p-5 text-sm text-muted">空目录。</p>
            )}
            {entries.map((entry) => (
              <div key={entry.name} className="flex items-center gap-3 px-5 py-2.5">
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => entry.is_dir && setCwd(joinPath(cwd, entry.name))}
                  disabled={!entry.is_dir}
                >
                  <span className="text-base">{entry.is_dir ? '📁' : '📄'}</span>
                  <span
                    className={`truncate text-sm ${entry.is_dir ? 'text-brand' : 'text-text'}`}
                  >
                    {entry.name}
                  </span>
                </button>
                <span className="hidden w-24 shrink-0 text-right font-[family-name:var(--font-mono)] text-xs text-muted sm:block">
                  {entry.is_dir ? '—' : formatBytes(entry.size)}
                </span>
                <span className="hidden w-28 shrink-0 font-[family-name:var(--font-mono)] text-xs text-muted md:block">
                  {entry.mode}
                </span>
                <span className="hidden w-40 shrink-0 text-xs text-muted lg:block">
                  {fmtTime(entry.mod_time)}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {!entry.is_dir && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => void download(entry)}>
                        下载
                      </Button>
                      {canWrite && (
                        <Button size="sm" variant="ghost" onClick={() => void openEditor(entry)}>
                          编辑
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSharing({ path: joinPath(cwd, entry.name), isDir: entry.is_dir })}
                    disabled={!canWrite}
                  >
                    分享
                  </Button>
                  {canWrite && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => void rename(entry)}>
                        重命名
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void chmod(entry)}>
                        权限
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void remove(entry)}>
                        删除
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <EditorModal
          path={editing.path}
          text={editing.text}
          onChange={(t) => setEditing({ ...editing, text: t })}
          onSave={() => void saveEditor()}
          onClose={() => setEditing(null)}
        />
      )}

      {sharing && (
        <ShareModal
          path={sharing.path}
          isDir={sharing.isDir}
          onClose={() => setSharing(null)}
        />
      )}

      {showShares && <ShareList onClose={() => setShowShares(false)} />}
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-(--radius-card) border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function EditorModal({
  path,
  text,
  onChange,
  onSave,
  onClose,
}: {
  path: string
  text: string
  onChange: (t: string) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="truncate text-sm font-medium text-text">编辑 {path}</h2>
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="h-80 w-full rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        />
        <div className="flex items-center gap-2">
          <Button onClick={onSave}>保存</Button>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ShareModal({
  path,
  isDir,
  onClose,
}: {
  path: string
  isDir: boolean
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [allowList, setAllowList] = useState(isDir)
  const [expiresHours, setExpiresHours] = useState('')
  const [maxDownloads, setMaxDownloads] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      const share = await apiFetch<Share>('/api/m/files/shares', {
        method: 'POST',
        body: JSON.stringify({
          path,
          password,
          allow_list: allowList,
          expires_in_sec: expiresHours ? Math.round(Number(expiresHours) * 3600) : 0,
          max_downloads: maxDownloads ? Number(maxDownloads) : 0,
        }),
      })
      setLink(`${location.origin}/s/${share.token}`)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="truncate text-sm font-medium text-text">创建分享 · {path}</h2>
        {link ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-online">分享链接已创建:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded border border-border bg-surface-2 px-3 py-2 font-[family-name:var(--font-mono)] text-xs text-text">
                {link}
              </code>
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(link)
                  setCopied(true)
                }}
              >
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
          </div>
        ) : (
          <>
            <Input
              label="访问密码(可选)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="有效期(小时,留空永久)"
                inputMode="numeric"
                value={expiresHours}
                onChange={(e) => setExpiresHours(e.target.value)}
              />
              <Input
                label="下载次数上限(留空不限)"
                inputMode="numeric"
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value)}
              />
            </div>
            {isDir && (
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={allowList}
                  onChange={(e) => setAllowList(e.target.checked)}
                />
                允许列目录
              </label>
            )}
            {err && <p className="text-sm text-crit">{err}</p>}
            <div className="flex items-center gap-2">
              <Button onClick={() => void create()} disabled={busy}>
                创建分享
              </Button>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                取消
              </Button>
              {busy && <Spinner size={16} />}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function ShareList({ onClose }: { onClose: () => void }) {
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setShares(await apiFetch<Share[]>('/api/m/files/shares'))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function revoke(token: string) {
    if (!window.confirm('确认撤销此分享?链接将立即失效。')) return
    try {
      await apiFetch(`/api/m/files/shares/${token}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text">已创建的分享</h2>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : err ? (
          <p className="text-sm text-crit">{err}</p>
        ) : shares.length === 0 ? (
          <p className="text-sm text-muted">暂无分享。</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {shares.map((s) => (
              <div key={s.token} className="flex items-center gap-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm text-text">{s.path}</span>
                  <code className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                    {location.origin}/s/{s.token}
                  </code>
                  <span className="text-xs text-muted">
                    {s.has_password ? '有密码 · ' : ''}
                    {s.allow_list ? '可列目录 · ' : ''}
                    下载 {s.downloads}
                    {s.max_downloads ? `/${s.max_downloads}` : ''}
                    {s.expires_at ? ` · 过期 ${fmtTime(s.expires_at)}` : ' · 永久'}
                  </span>
                </div>
                <Button size="sm" variant="danger" onClick={() => void revoke(s.token)}>
                  撤销
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      </div>
    </Modal>
  )
}
