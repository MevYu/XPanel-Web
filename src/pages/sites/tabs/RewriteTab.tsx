import { useEffect, useState } from 'react'
import { apiFetch } from '../../../api/client'
import { type Site, type RewriteTemplate, errorText, fieldClass, textareaClass } from '../shared'
import { TabSection, Labeled, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

/** RewriteTab 伪静态:内置模板下拉 + 自定义规则编辑,PUT /rewrite。 */
export function RewriteTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data, loading } = useTabResource<{ rewrite_rules: string }>(
    `/api/m/sites/sites/${site.id}/rewrite`,
    { rewrite_rules: site.rewrite_rules },
  )
  const [templates, setTemplates] = useState<RewriteTemplate[]>([])
  const [rules, setRules] = useState(site.rewrite_rules)
  const [synced, setSynced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    void apiFetch<RewriteTemplate[]>('/api/m/sites/rewrite-templates')
      .then(setTemplates)
      .catch(() => setTemplates([]))
  }, [])

  if (!loading && !synced) {
    setRules(data.rewrite_rules)
    setSynced(true)
  }

  if (loading) return <TabLoading />

  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id)
    if (tpl) setRules(tpl.content)
  }

  async function save() {
    if (!canWrite) return
    setBusy(true)
    setMsg(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/rewrite`, {
        method: 'PUT',
        body: JSON.stringify({ rewrite_rules: rules }),
      })
      onChanged(updated)
      setMsg({ kind: 'ok', text: '伪静态规则已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="伪静态" desc="选内置框架模板填充,或自定义 nginx location / rewrite 指令。">
      <Labeled label="模板">
        <select
          defaultValue=""
          onChange={(e) => applyTemplate(e.target.value)}
          disabled={!canWrite || templates.length === 0}
          className={fieldClass}
        >
          <option value="" disabled>
            选择框架模板…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Labeled>

      <Labeled label="规则">
        <textarea
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          placeholder={'location / {\n    try_files $uri $uri/ /index.php?$args;\n}'}
          spellCheck={false}
          disabled={!canWrite}
          className={`${textareaClass} h-64`}
        />
      </Labeled>

      <Feedback msg={msg} />
      {canWrite && <SaveBar onSave={() => void save()} busy={busy} hint="保存后经 nginx -t 校验,失败不生效。" />}
    </TabSection>
  )
}
