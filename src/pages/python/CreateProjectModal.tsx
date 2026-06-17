import { useState } from 'react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { type Project, type StartKind, errorText, fieldClass } from './shared'

interface Form {
  name: string
  interpreter: string
  start_kind: StartKind
  app_target: string
  port: string
  workers: string
}

const empty: Form = {
  name: '',
  interpreter: '',
  start_kind: 'gunicorn',
  app_target: '',
  port: '',
  workers: '1',
}

/** CreateProjectModal 添加 Python 项目弹窗:固定尺寸,按后端契约提交(创建限 admin)。 */
export function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (p: Project) => void
}) {
  const [form, setForm] = useState<Form>(empty)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isScript = form.start_kind === 'script'
  const portNum = Number(form.port)
  const portValid = isScript || (Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535)
  const workersNum = Number(form.workers)
  const workersValid = Number.isInteger(workersNum) && workersNum >= 1 && workersNum <= 256
  const canSubmit =
    form.name.trim().length > 0 &&
    form.app_target.trim().length > 0 &&
    portValid &&
    workersValid &&
    !busy

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        interpreter: form.interpreter.trim(),
        start_kind: form.start_kind,
        app_target: form.app_target.trim(),
        workers: workersNum,
      }
      if (!isScript) body.port = portNum
      else if (form.port.trim()) body.port = portNum
      const p = await apiFetch<Project>('/api/m/python/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      onCreated(p)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="添加项目" size="md" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="名称"
            placeholder="项目名"
            value={form.name}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoFocus
            onChange={(e) => set('name', e.target.value)}
          />
          <Input
            label="解释器"
            placeholder="留空用默认,如 python3.11"
            value={form.interpreter}
            spellCheck={false}
            onChange={(e) => set('interpreter', e.target.value)}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">启动方式</span>
            <select
              value={form.start_kind}
              onChange={(e) => set('start_kind', e.target.value as StartKind)}
              className={fieldClass}
            >
              <option value="gunicorn">gunicorn</option>
              <option value="uvicorn">uvicorn</option>
              <option value="script">script</option>
            </select>
          </label>
          <Input
            label={isScript ? '脚本路径' : '应用入口 app_target'}
            placeholder={isScript ? '相对脚本路径' : 'module:app'}
            value={form.app_target}
            spellCheck={false}
            className="font-[family-name:var(--font-mono)]"
            onChange={(e) => set('app_target', e.target.value)}
          />
          <Input
            label={isScript ? '端口(可选)' : '端口'}
            placeholder="1-65535"
            inputMode="numeric"
            value={form.port}
            error={form.port.length > 0 && !portValid ? '端口需为 1–65535' : undefined}
            onChange={(e) => set('port', e.target.value)}
          />
          <Input
            label="worker 数"
            placeholder="1-256"
            inputMode="numeric"
            value={form.workers}
            error={form.workers.length > 0 && !workersValid ? 'worker 需为 1–256' : undefined}
            onChange={(e) => set('workers', e.target.value)}
          />
        </div>

        <p className="text-xs text-muted">创建时会按解释器建立 venv。创建需要 admin 角色。</p>

        {err && (
          <p className="rounded-(--radius-card) border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {err}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy && <Spinner size={14} />}
            创建项目
          </Button>
        </div>
      </div>
    </Modal>
  )
}
