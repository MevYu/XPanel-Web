import { useEffect, useState, type ReactNode } from 'react'
import { apiFetch } from '../api/client'
import { Modal } from './Modal'
import { Button } from './Button'
import { Spinner } from './Spinner'

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

interface SettingsModalProps<T> {
  title: string
  /** GET 预填、PUT 保存共用此端点(如 /api/m/php/settings)。 */
  endpoint: string
  /** 仅 UI 门:非 admin 时禁用保存;真正鉴权在后端。 */
  isAdmin: boolean
  onClose: () => void
  /** 渲染字段:form 当前值,set 改单个字段,disabled 在非 admin 时为 true。 */
  children: (
    form: T,
    set: <K extends keyof T>(key: K, value: T[K]) => void,
    disabled: boolean,
  ) => ReactNode
}

/**
 * SettingsModal 模块「全局设置」通用外壳:打开即 GET 预填,保存走 PUT,inline 成功/失败反馈,保存限 admin。
 * 仅托管加载/保存/反馈这层样板;字段表单由各模块经 children 自渲染,不做通用 schema。
 */
export function SettingsModal<T>({ title, endpoint, isAdmin, onClose, children }: SettingsModalProps<T>) {
  const [form, setForm] = useState<T | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        setForm(await apiFetch<T>(endpoint))
      } catch (e) {
        setFeedback({ kind: 'err', text: errorText(e) })
      }
    })()
  }, [endpoint])

  function set<K extends keyof T>(key: K, value: T[K]) {
    setForm((s) => (s ? { ...s, [key]: value } : s))
  }

  async function save() {
    if (!isAdmin || !form) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(endpoint, { method: 'PUT', body: JSON.stringify(form) })
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={title} size="md" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {form === null ? (
          feedback ? (
            <p className="text-sm text-crit">{feedback.text}</p>
          ) : (
            <div className="flex items-center justify-center py-10">
              <Spinner size={20} />
            </div>
          )
        ) : (
          <>
            {children(form, set, !isAdmin)}
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
          </>
        )}
      </div>
    </Modal>
  )
}
