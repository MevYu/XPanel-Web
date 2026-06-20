import { useState } from 'react'
import { apiFetch } from '../../../api/client'
import { type Site, errorText, fieldClass } from '../shared'
import { TabSection, Labeled, SaveBar, Feedback } from '../tabui'

/** LimitsTab 流量控制:每连接限速 + 单 IP 并发连接数,整体 PUT。0 表示不限。 */
export function LimitsTab({
  site,
  canWrite,
  onChanged,
}: {
  site: Site
  canWrite: boolean
  onChanged: (s: Site) => void
}) {
  const [rateKb, setRateKb] = useState(String(site.limits?.rate_kb ?? 0))
  const [conn, setConn] = useState(String(site.limits?.conn ?? 0))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const rate = Number(rateKb)
  const connNum = Number(conn)
  const valid =
    Number.isInteger(rate) && rate >= 0 && rate <= 1048576 && Number.isInteger(connNum) && connNum >= 0 && connNum <= 65535

  async function save() {
    if (!canWrite || !valid) return
    setBusy(true)
    setMsg(null)
    try {
      const updated = await apiFetch<Site>(`/api/m/sites/sites/${site.id}/limits`, {
        method: 'PUT',
        body: JSON.stringify({ rate_kb: rate, conn: connNum }),
      })
      onChanged(updated)
      setMsg({ kind: 'ok', text: '流量控制已保存' })
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabSection title="流量控制" desc="限制单连接带宽与单 IP 并发连接数,缓解滥用与突发。0 表示不限制。">
      <div className="flex flex-col gap-3">
        <Labeled label="每连接限速 (KB/s)">
          <input
            className={fieldClass}
            inputMode="numeric"
            value={rateKb}
            onChange={(e) => setRateKb(e.target.value)}
            placeholder="0 = 不限"
          />
        </Labeled>
        <Labeled label="单 IP 并发连接数">
          <input
            className={fieldClass}
            inputMode="numeric"
            value={conn}
            onChange={(e) => setConn(e.target.value)}
            placeholder="0 = 不限"
          />
        </Labeled>
        <Feedback msg={msg} />
        <SaveBar onSave={() => void save()} busy={busy} disabled={!canWrite || !valid} />
      </div>
    </TabSection>
  )
}
