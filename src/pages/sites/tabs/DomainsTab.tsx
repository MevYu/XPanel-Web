import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { Globe, Plus, X } from 'lucide-react'
import { type Site, type DomainBinding, errorText, fieldClass } from '../shared'
import { TabSection, SaveBar, Feedback } from '../tabui'

interface Row {
  domain: string
  port: string
}

function toRows(site: Site): Row[] {
  const bindings =
    site.domain_bindings?.length > 0
      ? site.domain_bindings
      : site.domains.map((d) => ({ domain: d, port: site.listen }))
  return bindings.map((b) => ({ domain: b.domain, port: String(b.port || site.listen) }))
}

/** DomainsTab 域名:增删带端口的绑定,PUT /domains 下发。 */
export function DomainsTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const [rows, setRows] = useState<Row[]>(toRows(site))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  const valid = rows.length > 0 && rows.every((r) => r.domain.trim() && Number(r.port) >= 1 && Number(r.port) <= 65535)

  async function save() {
    if (!canWrite || !valid) return
    setBusy(true)
    setMsg(null)
    try {
      const bindings: DomainBinding[] = rows.map((r) => ({
        domain: r.domain.trim().toLowerCase(),
        port: Number(r.port),
      }))
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/domains`, {
        method: 'PUT',
        body: JSON.stringify({ bindings }),
      })
      onChanged(updated)
      setRows(toRows(updated))
      setMsg({ kind: 'ok', text: '域名已更新' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="域名绑定" desc="每条绑定一个域名与端口。开启 SSL 时会额外生成 443 块。">
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Globe size={15} className="shrink-0 text-muted" />
            <input
              value={r.domain}
              onChange={(e) => setRow(i, { domain: e.target.value })}
              placeholder="example.com"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              disabled={!canWrite}
              className={`${fieldClass} flex-1 font-[family-name:var(--font-mono)]`}
            />
            <span className="text-muted">:</span>
            <input
              value={r.port}
              onChange={(e) => setRow(i, { port: e.target.value })}
              inputMode="numeric"
              disabled={!canWrite}
              className={`${fieldClass} w-20 font-[family-name:var(--font-mono)]`}
            />
            <button
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              disabled={!canWrite || rows.length === 1}
              aria-label="移除域名"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-crit/10 hover:text-crit disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setRows((rs) => [...rs, { domain: '', port: String(site.listen) }])}
        disabled={!canWrite}
        className="inline-flex w-fit items-center gap-1.5 rounded-(--radius-card) border border-dashed border-border px-3 py-2 text-sm text-muted transition hover:border-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={14} />
        添加域名
      </button>

      <Feedback msg={msg} />
      {canWrite && <SaveBar onSave={() => void save()} busy={busy} disabled={!valid} hint="保存后经 nginx -t 校验,失败不生效。" />}
    </TabSection>
  )
}
