import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Input } from '../../../components/Input'
import { Plus, X } from 'lucide-react'
import { type Site, type ProxyConfig, errorText, fieldClass, SEND_HOST_OPTIONS } from '../shared'
import { TabSection, SwitchRow, SaveBar, Feedback, TabLoading, useTabResource } from '../tabui'

const DEFAULT: ProxyConfig = {
  proxy_target: '',
  upstreams: [],
  cache: false,
  cache_time: 0,
  set_headers: [],
  websocket: false,
  send_host: '',
}

/** ProxyTab 反向代理:目标 + 多上游负载均衡 + 缓存 + 自定义头 + WebSocket + Host 传递。 */
export function ProxyTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const { data, loading } = useTabResource<ProxyConfig>(`/api/m/sites/sites/${site.id}/proxy`, {
    ...DEFAULT,
    proxy_target: site.proxy_target,
  })
  const [cfg, setCfg] = useState<ProxyConfig>(DEFAULT)
  const [synced, setSynced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (!loading && !synced) {
    setCfg({
      ...DEFAULT,
      ...data,
      upstreams: data.upstreams ?? [],
      set_headers: data.set_headers ?? [],
    })
    setSynced(true)
  }
  if (loading) return <TabLoading />

  function patch(p: Partial<ProxyConfig>) {
    setCfg((c) => ({ ...c, ...p }))
  }

  const headersValid = cfg.set_headers.every((h) => h.name.trim())
  const canSave = Boolean(cfg.proxy_target.trim()) && headersValid

  async function save() {
    if (!canWrite || !canSave) return
    setBusy(true)
    setMsg(null)
    try {
      const body: ProxyConfig = {
        proxy_target: cfg.proxy_target.trim(),
        upstreams: cfg.upstreams.map((u) => u.trim()).filter(Boolean),
        cache: cfg.cache,
        cache_time: cfg.cache ? Math.max(0, cfg.cache_time) : 0,
        set_headers: cfg.set_headers
          .filter((h) => h.name.trim())
          .map((h) => ({ name: h.name.trim(), value: h.value.trim() })),
        websocket: cfg.websocket,
        send_host: cfg.send_host,
      }
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/proxy`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      onChanged(updated)
      setSynced(false)
      setMsg({ kind: 'ok', text: '反向代理配置已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <TabSection title="后端地址" desc="主上游目标。配置多个上游时在其之间做负载均衡。">
        <Input
          label="目标 (upstream)"
          placeholder="http://127.0.0.1:3000"
          value={cfg.proxy_target}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={!canWrite}
          onChange={(e) => patch({ proxy_target: e.target.value })}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">额外上游(负载均衡)</span>
          {cfg.upstreams.length === 0 && <p className="text-xs text-muted">仅使用上方单一目标。</p>}
          {cfg.upstreams.map((u, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={u}
                onChange={(e) =>
                  patch({ upstreams: cfg.upstreams.map((x, j) => (j === i ? e.target.value : x)) })
                }
                placeholder="http://127.0.0.1:3001"
                spellCheck={false}
                disabled={!canWrite}
                className={`${fieldClass} min-w-40 flex-1 font-[family-name:var(--font-mono)]`}
              />
              <button
                onClick={() => patch({ upstreams: cfg.upstreams.filter((_, j) => j !== i) })}
                disabled={!canWrite}
                aria-label="移除上游"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-crit/10 hover:text-crit disabled:cursor-not-allowed disabled:opacity-30"
              >
                <X size={15} />
              </button>
            </div>
          ))}
          <button
            onClick={() => patch({ upstreams: [...cfg.upstreams, ''] })}
            disabled={!canWrite}
            className="inline-flex w-fit items-center gap-1.5 rounded-(--radius-card) border border-dashed border-border px-3 py-2 text-sm text-muted transition hover:border-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} />
            添加上游
          </button>
        </div>
      </TabSection>

      <TabSection title="转发选项">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">传递 Host 头</span>
          <select
            value={cfg.send_host}
            onChange={(e) => patch({ send_host: e.target.value })}
            disabled={!canWrite}
            className={`${fieldClass} w-full`}
          >
            {SEND_HOST_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o === '' ? '默认(不修改)' : o}
              </option>
            ))}
            {site.domains[0] && <option value={site.domains[0]}>{site.domains[0]}</option>}
          </select>
        </label>
        <SwitchRow
          label="WebSocket"
          desc="转发 Upgrade / Connection 头以支持 WebSocket。"
          checked={cfg.websocket}
          onChange={(v) => patch({ websocket: v })}
          disabled={!canWrite}
        />
        <SwitchRow
          label="启用缓存"
          desc="缓存上游响应以降低后端压力。"
          checked={cfg.cache}
          onChange={(v) => patch({ cache: v })}
          disabled={!canWrite}
        />
        {cfg.cache && (
          <Input
            label="缓存时长(秒)"
            type="number"
            min={0}
            value={String(cfg.cache_time)}
            disabled={!canWrite}
            onChange={(e) => patch({ cache_time: Number(e.target.value) || 0 })}
          />
        )}
      </TabSection>

      <TabSection title="自定义请求头" desc="转发到上游时附加的 header。">
        {cfg.set_headers.length === 0 && <p className="text-xs text-muted">暂无自定义头。</p>}
        {cfg.set_headers.map((h, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={h.name}
              onChange={(e) =>
                patch({
                  set_headers: cfg.set_headers.map((x, j) =>
                    j === i ? { ...x, name: e.target.value } : x,
                  ),
                })
              }
              placeholder="X-Real-IP"
              spellCheck={false}
              disabled={!canWrite}
              className={`${fieldClass} min-w-32 flex-1 font-[family-name:var(--font-mono)]`}
            />
            <span className="text-muted">:</span>
            <input
              value={h.value}
              onChange={(e) =>
                patch({
                  set_headers: cfg.set_headers.map((x, j) =>
                    j === i ? { ...x, value: e.target.value } : x,
                  ),
                })
              }
              placeholder="$remote_addr"
              spellCheck={false}
              disabled={!canWrite}
              className={`${fieldClass} min-w-40 flex-[2] font-[family-name:var(--font-mono)]`}
            />
            <button
              onClick={() => patch({ set_headers: cfg.set_headers.filter((_, j) => j !== i) })}
              disabled={!canWrite}
              aria-label="移除头"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-crit/10 hover:text-crit disabled:cursor-not-allowed disabled:opacity-30"
            >
              <X size={15} />
            </button>
          </div>
        ))}
        <button
          onClick={() => patch({ set_headers: [...cfg.set_headers, { name: '', value: '' }] })}
          disabled={!canWrite}
          className="inline-flex w-fit items-center gap-1.5 rounded-(--radius-card) border border-dashed border-border px-3 py-2 text-sm text-muted transition hover:border-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={14} />
          添加请求头
        </button>
      </TabSection>

      <Feedback msg={msg} />
      {canWrite && (
        <SaveBar
          onSave={() => void save()}
          busy={busy}
          disabled={!canSave}
          hint="保存后经 nginx -t 校验,失败不生效。"
        />
      )}
    </div>
  )
}
