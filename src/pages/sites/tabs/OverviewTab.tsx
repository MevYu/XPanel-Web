import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Button } from '../../../components/Button'
import { Spinner } from '../../../components/Spinner'
import { type Site, DANGER, errorText, kindLabel, formatTime } from '../shared'

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`text-sm text-text ${mono ? 'font-[family-name:var(--font-mono)] break-all' : ''}`}>
        {children}
      </dd>
    </div>
  )
}

/** OverviewTab 概览:运行状态启停 + 站点元数据。 */
export function OverviewTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function toggle(enable: boolean) {
    if (!canWrite) return
    if (!enable && !window.confirm(`确认停用站点「${site.name}」?这将下线该站点。`)) return
    setBusy(true)
    setErr(null)
    try {
      const updated = await apiFetch<Site>(
        `/api/m/sites/sites/${site.id}/${enable ? 'enable' : 'disable'}`,
        { method: 'POST', headers: enable ? undefined : DANGER },
      )
      onChanged(updated)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-(--radius-card) border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text">运行状态</span>
            <span className="text-xs text-muted">
              {site.enabled ? '站点配置已下发,正在对外服务。' : '配置已从 nginx 移除,当前下线。'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {busy && <Spinner size={16} />}
            {site.enabled ? (
              <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => void toggle(false)}>
                停用
              </Button>
            ) : (
              <Button size="sm" disabled={!canWrite} onClick={() => void toggle(true)}>
                启用
              </Button>
            )}
          </div>
        </div>
        {err && <p className="mt-3 text-sm text-crit">{err}</p>}
      </section>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-(--radius-card) border border-border bg-surface p-5">
        <Field label="站点名">{site.name}</Field>
        <Field label="类型">{kindLabel[site.kind] ?? site.kind}</Field>
        <Field label="监听端口" mono>:{site.listen}</Field>
        <Field label="域名数">{site.domains.length}</Field>
        {site.kind === 'php' && <Field label="PHP 版本" mono>{site.php_version || '默认'}</Field>}
        {site.kind === 'proxy' && <Field label="后端地址" mono>{site.proxy_target || '—'}</Field>}
        {site.kind !== 'proxy' && <Field label="运行目录" mono>{site.root_dir || '—'}</Field>}
        <Field label="SSL">{site.ssl?.ssl_enabled ? '已启用' : '未启用'}</Field>
        <Field label="创建时间">{formatTime(site.created_at)}</Field>
        <Field label="更新时间">{formatTime(site.updated_at)}</Field>
      </dl>
    </div>
  )
}
