import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Button } from '../../../components/Button'
import { Spinner } from '../../../components/Spinner'
import { AlertTriangle } from 'lucide-react'
import { type Site, DANGER, errorText } from '../shared'
import { TabLoading } from '../tabui'
import { CodeEditor } from '../../../components/CodeEditor'

/** ConfigTab 配置文件:直接编辑生成的 nginx 配置。危险操作,仅 admin + 二次确认。 */
export function ConfigTab({
  site,
  isAdmin,
  onChanged,
}: {
  site: Site
  isAdmin: boolean
  onChanged: (s: Site) => void
}) {
  const [draft, setDraft] = useState(site.config)
  const [base, setBase] = useState(site.config)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ config: string }>(`/api/m/sites/sites/${site.id}/config`)
      setDraft(res.config)
      setBase(res.config)
    } catch {
      setDraft(site.config)
      setBase(site.config)
    } finally {
      setLoading(false)
    }
  }, [site.id, site.config])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!isAdmin || !window.confirm('确认替换站点配置?原始配置可绕过建站白名单,属危险操作,会立即重载 nginx。')) {
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/config`, {
        method: 'PUT',
        headers: DANGER,
        body: JSON.stringify({ config: draft }),
      })
      onChanged(updated)
      setBase(draft)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <TabLoading />

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-(--radius-card) border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs text-warn">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>
          直接编辑会覆盖由设置生成的配置,且能绕过建站白名单。
          {isAdmin ? '保存经 nginx -t 校验,失败则回滚不生效。' : '仅 admin 可编辑。'}
        </span>
      </div>
      <CodeEditor
        value={draft}
        onChange={setDraft}
        language="nginx"
        readOnly={!isAdmin}
        onSave={isAdmin ? () => void save() : undefined}
        height="52vh"
      />
      {err && (
        <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {err}
        </p>
      )}
      {isAdmin && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="danger" onClick={() => void save()} disabled={busy || draft === base}>
            {busy && <Spinner size={14} />}
            保存配置
          </Button>
          <span className="text-xs text-muted">危险操作,会立即重载 nginx。</span>
        </div>
      )}
    </div>
  )
}
