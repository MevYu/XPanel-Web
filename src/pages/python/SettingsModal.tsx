import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { type PySettings, emptySettings, errorText } from './shared'

/** SettingsModal Python 模块路径设置弹窗:固定尺寸,保存限 admin。 */
export function SettingsModal({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<PySettings>(emptySettings)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        setSettings(await apiFetch<PySettings>('/api/m/python/settings'))
      } catch (e) {
        setFeedback({ kind: 'err', text: errorText(e) })
      }
    })()
  }, [])

  function set<K extends keyof PySettings>(key: K, value: PySettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }))
  }

  async function save() {
    if (!isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/python/settings', { method: 'PUT', body: JSON.stringify(settings) })
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Python 设置" size="md" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="项目根目录 project_root"
            value={settings.project_root}
            spellCheck={false}
            disabled={!isAdmin}
            className="font-[family-name:var(--font-mono)]"
            onChange={(e) => set('project_root', e.target.value)}
          />
          <Input
            label="venv 根目录 venv_root"
            value={settings.venv_root}
            spellCheck={false}
            disabled={!isAdmin}
            className="font-[family-name:var(--font-mono)]"
            onChange={(e) => set('venv_root', e.target.value)}
          />
          <Input
            label="默认解释器 interpreter"
            value={settings.interpreter}
            spellCheck={false}
            disabled={!isAdmin}
            onChange={(e) => set('interpreter', e.target.value)}
          />
          <Input
            label="进程配置目录 conf_dir"
            value={settings.conf_dir}
            spellCheck={false}
            disabled={!isAdmin}
            className="font-[family-name:var(--font-mono)]"
            onChange={(e) => set('conf_dir', e.target.value)}
          />
          <Input
            label="日志目录 log_dir"
            value={settings.log_dir}
            spellCheck={false}
            disabled={!isAdmin}
            className="font-[family-name:var(--font-mono)]"
            onChange={(e) => set('log_dir', e.target.value)}
          />
        </div>

        {!isAdmin && <p className="text-xs text-muted">设置需要 admin 角色。</p>}

        {feedback && (
          <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
            {feedback.text}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={() => void save()} disabled={!isAdmin || busy}>
            {busy && <Spinner size={14} />}
            保存设置
          </Button>
        </div>
      </div>
    </Modal>
  )
}
