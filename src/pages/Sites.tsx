import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
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

const DANGER = { 'X-Confirm-Danger': '1' }

const selectClass =
  'h-10 rounded-(--radius-card) border border-border bg-surface-2 px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

interface Site {
  id: number
  name: string
  domains: string[]
  kind: string
  listen: number
  enabled: boolean
  config: string
  created_by: number | null
  created_at: number
  updated_at: number
}

type Kind = 'static' | 'proxy' | 'php'

interface CreateForm {
  domains: string
  kind: Kind
  listen: string
  upstream: string
  index: string
}

const emptyForm: CreateForm = { domains: '', kind: 'static', listen: '80', upstream: '', index: '' }

const kindLabel: Record<string, string> = {
  static: '静态',
  proxy: '反向代理',
  php: 'PHP',
}

/** Sites 网站:列出 vhost,创建(静态/反代/PHP),启停,删除,查看与编辑生成的配置。 */
export default function Sites() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canWrite = role === 'admin' || role === 'operator'

  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState<CreateForm>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const [openId, setOpenId] = useState<number | null>(null)
  const [configDraft, setConfigDraft] = useState('')
  const [configBusy, setConfigBusy] = useState(false)
  const [configErr, setConfigErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const data = await apiFetch<Site[]>('/api/m/sites/sites')
      setSites(data)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const domains = form.domains
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  const listenNum = Number(form.listen)
  const listenValid = Number.isInteger(listenNum) && listenNum >= 1 && listenNum <= 65535
  const proxyValid = form.kind !== 'proxy' || form.upstream.trim().length > 0
  const canSubmit = domains.length > 0 && listenValid && proxyValid && !busy && canWrite

  async function create() {
    if (!canSubmit) return
    setBusy(true)
    setFormErr(null)
    try {
      const body: Record<string, unknown> = {
        domains,
        kind: form.kind,
        listen: listenNum,
      }
      if (form.index.trim()) body.index = form.index.trim()
      if (form.kind === 'proxy') body.upstream = form.upstream.trim()
      await apiFetch('/api/m/sites/sites', { method: 'POST', body: JSON.stringify(body) })
      setForm(emptyForm)
      await load()
    } catch (e) {
      setFormErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(site: Site, enable: boolean) {
    if (!canWrite) return
    if (!enable && !window.confirm(`确认停用站点「${site.name}」?这将下线该站点。`)) return
    try {
      await apiFetch(`/api/m/sites/sites/${site.id}/${enable ? 'enable' : 'disable'}`, {
        method: 'POST',
        headers: enable ? undefined : DANGER,
      })
      await load()
    } catch (e) {
      setLoadErr(errorText(e))
    }
  }

  async function remove(site: Site) {
    if (!isAdmin) return
    if (!window.confirm(`确认删除站点「${site.name}」?此操作危险,不可恢复。`)) return
    try {
      await apiFetch(`/api/m/sites/sites/${site.id}`, { method: 'DELETE', headers: DANGER })
      if (openId === site.id) setOpenId(null)
      await load()
    } catch (e) {
      setLoadErr(errorText(e))
    }
  }

  async function openConfig(site: Site) {
    if (openId === site.id) {
      setOpenId(null)
      return
    }
    setConfigErr(null)
    setOpenId(site.id)
    try {
      const full = await apiFetch<Site>(`/api/m/sites/sites/${site.id}`)
      setConfigDraft(full.config)
    } catch {
      setConfigDraft(site.config)
    }
  }

  async function saveConfig(id: number) {
    if (!canWrite) return
    setConfigBusy(true)
    setConfigErr(null)
    try {
      await apiFetch(`/api/m/sites/sites/${id}/config`, {
        method: 'PUT',
        body: JSON.stringify({ config: configDraft }),
      })
      await load()
      setOpenId(null)
    } catch (e) {
      setConfigErr(errorText(e))
    } finally {
      setConfigBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">创建站点</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="域名"
            placeholder="多个用空格或逗号分隔"
            value={form.domains}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setForm((f) => ({ ...f, domains: e.target.value }))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">类型</span>
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as Kind }))}
              className={selectClass}
            >
              <option value="static">静态</option>
              <option value="proxy">反向代理</option>
              <option value="php">PHP</option>
            </select>
          </label>
          <Input
            label="监听端口"
            placeholder="80"
            inputMode="numeric"
            value={form.listen}
            error={form.listen.length > 0 && !listenValid ? '端口需为 1–65535' : undefined}
            onChange={(e) => setForm((f) => ({ ...f, listen: e.target.value }))}
          />
          {form.kind === 'proxy' ? (
            <Input
              label="后端地址 upstream"
              placeholder="例如 http://127.0.0.1:3000"
              value={form.upstream}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setForm((f) => ({ ...f, upstream: e.target.value }))}
            />
          ) : (
            <Input
              label="首页文件 index"
              placeholder="可选,如 index.html"
              value={form.index}
              spellCheck={false}
              onChange={(e) => setForm((f) => ({ ...f, index: e.target.value }))}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void create()} disabled={!canSubmit}>
            创建
          </Button>
          {busy && <Spinner size={16} />}
        </div>
        {!canWrite && <p className="text-xs text-muted">创建与变更需要 operator 角色。</p>}
        {formErr && <p className="text-sm text-crit">{formErr}</p>}
      </Card>

      <Card className="p-0">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && sites.length === 0 ? (
          <p className="p-5 text-sm text-muted">{loadErr}</p>
        ) : sites.length === 0 ? (
          <p className="p-5 text-sm text-muted">暂无站点。</p>
        ) : (
          <div className="divide-y divide-border">
            {sites.map((site) => (
              <div key={site.id} className="flex flex-col gap-3 px-5 py-3.5">
                <div className="flex items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{site.name}</span>
                      <Badge status={site.enabled ? 'online' : 'neutral'}>
                        {site.enabled ? '运行中' : '已停用'}
                      </Badge>
                      <Badge status="neutral">{kindLabel[site.kind] ?? site.kind}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>:{site.listen}</span>
                      <span className="truncate font-[family-name:var(--font-mono)]">
                        {site.domains.join(', ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => void openConfig(site)}>
                      {openId === site.id ? '收起' : '配置'}
                    </Button>
                    {site.enabled ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void toggle(site, false)}
                        disabled={!canWrite}
                      >
                        停用
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void toggle(site, true)}
                        disabled={!canWrite}
                      >
                        启用
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void remove(site)}
                      disabled={!isAdmin}
                      title={isAdmin ? undefined : '需要 admin 角色'}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                {openId === site.id && (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={configDraft}
                      onChange={(e) => setConfigDraft(e.target.value)}
                      spellCheck={false}
                      readOnly={!canWrite}
                      className="h-72 w-full resize-y rounded-(--radius-card) border border-border bg-surface-2 p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => void saveConfig(site.id)}
                        disabled={!canWrite || configBusy}
                      >
                        保存配置
                      </Button>
                      {configBusy && <Spinner size={16} />}
                      <span className="text-xs text-muted">
                        保存前会经 nginx -t 校验,失败则不生效。
                      </span>
                    </div>
                    {configErr && <p className="text-sm text-crit">{configErr}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
