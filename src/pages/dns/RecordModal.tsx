import { useState } from 'react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import {
  type DnsRecord,
  type RecordType,
  RECORD_TYPES,
  PRIORITY_TYPES,
  errorText,
  fieldClass,
  ttlValid,
} from './shared'

interface Form {
  name: string
  type: RecordType
  value: string
  ttl: string
  priority: string
}

function initForm(rec: DnsRecord | null): Form {
  if (!rec) return { name: '@', type: 'A', value: '', ttl: '3600', priority: '0' }
  return {
    name: rec.name,
    type: (RECORD_TYPES as readonly string[]).includes(rec.type) ? (rec.type as RecordType) : 'A',
    value: rec.value,
    ttl: String(rec.ttl),
    priority: String(rec.priority),
  }
}

/** RecordModal 添加/编辑解析记录:固定尺寸弹窗表单,主机/类型/值/TTL(+MX·SRV 优先级)。 */
export function RecordModal({
  zoneId,
  zoneName,
  record,
  onClose,
  onSaved,
}: {
  zoneId: number
  zoneName: string
  record: DnsRecord | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Form>(() => initForm(record))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const name = form.name.trim()
  const value = form.value.trim()
  const ttlNum = Number(form.ttl)
  const ttlOk = ttlValid(ttlNum)
  const showPriority = PRIORITY_TYPES.has(form.type)
  const canSubmit = name.length > 0 && value.length > 0 && ttlOk && !busy

  function set<K extends keyof Form>(key: K, val: Form[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const priority = showPriority ? Number(form.priority) || 0 : 0
      const payload = JSON.stringify({ name, type: form.type, value, ttl: ttlNum, priority })
      const base = `/api/m/dns/domains/${zoneId}/records`
      if (record === null) await apiFetch(base, { method: 'POST', body: payload })
      else await apiFetch(`${base}/${record.id}`, { method: 'PUT', body: payload })
      onSaved()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={record === null ? '添加解析记录' : '编辑解析记录'} size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          域名 <span className="font-[family-name:var(--font-mono)] text-text">{zoneName}</span>
        </p>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">类型</span>
            <select
              value={form.type}
              onChange={(e) => set('type', e.target.value as RecordType)}
              className={fieldClass}
            >
              {RECORD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="主机记录"
            placeholder="@ 或 www"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoFocus
            className="font-[family-name:var(--font-mono)]"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        <Input
          label="记录值"
          placeholder="例如 192.0.2.1"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-[family-name:var(--font-mono)]"
          value={form.value}
          onChange={(e) => set('value', e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="TTL(秒)"
            inputMode="numeric"
            value={form.ttl}
            error={form.ttl.length > 0 && !ttlOk ? 'TTL 需为 60–604800' : undefined}
            onChange={(e) => set('ttl', e.target.value)}
          />
          {showPriority && (
            <Input
              label="优先级"
              inputMode="numeric"
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
            />
          )}
        </div>
        {err && (
          <p className="rounded-(--radius-sm) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            {record === null ? '添加' : '保存'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
