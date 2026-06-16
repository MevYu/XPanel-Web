import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Input } from '../../../components/Input'
import { type Site, errorText } from '../shared'
import { TabSection, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

/** RunDirTab 运行目录:站点根下的子目录(如 public),PUT /run-dir(非 proxy)。 */
export function RunDirTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data, loading } = useTabResource<{ run_dir: string }>(
    `/api/m/sites/sites/${site.id}/run-dir`,
    { run_dir: site.root_dir },
  )
  const [subdir, setSubdir] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (loading) return <TabLoading />

  async function save() {
    if (!canWrite) return
    setBusy(true)
    setMsg(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/run-dir`, {
        method: 'PUT',
        body: JSON.stringify({ subdir: subdir.trim() }),
      })
      onChanged(updated)
      setSubdir('')
      setMsg({ kind: 'ok', text: '运行目录已更新' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection
      title="运行目录"
      desc="框架(如 Laravel)常把入口放在 public 子目录。留空回到站点根。"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">当前运行目录</span>
        <span className="break-all rounded-(--radius-card) border border-border bg-surface-2 px-3 py-2 font-[family-name:var(--font-mono)] text-xs text-text">
          {data.run_dir || '—'}
        </span>
      </div>
      <Input
        label="子目录"
        placeholder="public(留空 = 站点根)"
        value={subdir}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="font-[family-name:var(--font-mono)]"
        disabled={!canWrite}
        onChange={(e) => setSubdir(e.target.value)}
      />
      <Feedback msg={msg} />
      {canWrite && <SaveBar onSave={() => void save()} busy={busy} hint="保存后经 nginx -t 校验,失败不生效。" />}
    </TabSection>
  )
}
