import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Input } from '../../../components/Input'
import { Lock, Trash2 } from 'lucide-react'
import { type Site, type DirProtectView, errorText } from '../shared'
import { TabSection, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

/** DirProtectTab 目录保护:auth_basic 列表增删。口令只写,服务端不回显哈希。 */
export function DirProtectTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data: rules, loading, reload } = useTabResource<DirProtectView[]>(
    `/api/m/sites/sites/${site.id}/dir-protect`,
    site.dir_protect ?? [],
  )
  const [path, setPath] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (loading) return <TabLoading />

  const canAdd = path.trim() && username.trim() && password.length > 0

  async function add() {
    if (!canWrite || !canAdd) return
    setBusy(true)
    setMsg(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/dir-protect`, {
        method: 'POST',
        body: JSON.stringify({ path: path.trim(), username: username.trim(), password }),
      })
      onChanged(updated)
      setPath('')
      setUsername('')
      setPassword('')
      setMsg({ kind: 'ok', text: '目录保护已添加' })
      await reload()
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(rule: DirProtectView) {
    if (!canWrite) return
    if (!window.confirm(`移除对 ${rule.path} 的密码保护?`)) return
    setMsg(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/dir-protect`, {
        method: 'DELETE',
        body: JSON.stringify({ path: rule.path, username: rule.username }),
      })
      onChanged(updated)
      await reload()
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <TabSection title="已保护目录" desc="匹配前缀的路径要求 HTTP Basic 认证。">
        {rules.length === 0 ? (
          <p className="text-xs text-muted">暂无受保护目录。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.map((rule, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-(--radius-card) border border-border bg-surface-2 px-4 py-3"
              >
                <Lock size={15} className="shrink-0 text-muted" />
                <span className="truncate font-[family-name:var(--font-mono)] text-sm text-text">
                  {rule.path}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted">用户 {rule.username}</span>
                <button
                  onClick={() => void remove(rule)}
                  disabled={!canWrite}
                  aria-label="移除"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-crit/10 hover:text-crit disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </TabSection>

      {canWrite && (
        <TabSection title="添加保护" desc="口令仅用于生成 .htpasswd,不会被回显。">
          <Input
            label="路径前缀"
            placeholder="/admin"
            value={path}
            spellCheck={false}
            className="font-[family-name:var(--font-mono)]"
            onChange={(e) => setPath(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="用户名"
              placeholder="admin"
              value={username}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              label="密码"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Feedback msg={msg} />
          <SaveBar onSave={() => void add()} busy={busy} disabled={!canAdd} label="添加" />
        </TabSection>
      )}
      {!canWrite && <Feedback msg={msg} />}
    </div>
  )
}
