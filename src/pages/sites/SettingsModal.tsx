import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Card } from '../../components/Card'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { X } from 'lucide-react'
import { type SiteSettings, errorText } from './shared'

/** SettingsModal 建站路径设置:web 根/conf 目录/日志目录/php socket,仅 admin 可改。 */
export function SettingsModal({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [set, setSet] = useState<SiteSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    apiFetch<SiteSettings>('/api/m/sites/settings')
      .then(setSet)
      .catch((e) => setErr(errorText(e)))
  }, [])

  function field(key: keyof SiteSettings, value: string) {
    setSet((s) => (s ? { ...s, [key]: value } : s))
    setOk(false)
  }

  async function save() {
    if (!set || !isAdmin) return
    setBusy(true)
    setErr(null)
    try {
      const saved = await apiFetch<SiteSettings>('/api/m/sites/settings', {
        method: 'PUT',
        body: JSON.stringify(set),
      })
      setSet(saved)
      setOk(true)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card
        className="flex w-full max-w-lg flex-col gap-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-text">
              建站设置
            </h3>
            <p className="text-xs text-muted">站点目录、配置与日志路径,新建站点时套用。</p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-surface-2 hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        {!set ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Input
              label="Web 根目录"
              value={set.web_root}
              disabled={!isAdmin}
              spellCheck={false}
              onChange={(e) => field('web_root', e.target.value)}
            />
            <Input
              label="Nginx 配置目录"
              value={set.conf_dir}
              disabled={!isAdmin}
              spellCheck={false}
              onChange={(e) => field('conf_dir', e.target.value)}
            />
            <Input
              label="日志目录"
              value={set.log_dir}
              disabled={!isAdmin}
              spellCheck={false}
              onChange={(e) => field('log_dir', e.target.value)}
            />
            <Input
              label="PHP socket"
              value={set.php_socket}
              disabled={!isAdmin}
              spellCheck={false}
              onChange={(e) => field('php_socket', e.target.value)}
            />
          </div>
        )}

        {err && <p className="text-sm text-crit">{err}</p>}
        {ok && <p className="text-sm text-online">已保存。</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          {isAdmin && (
            <Button onClick={() => void save()} disabled={!set || busy}>
              {busy && <Spinner size={14} />}
              保存
            </Button>
          )}
        </div>
        {!isAdmin && <p className="text-xs text-muted">修改建站设置需要 admin 角色。</p>}
      </Card>
    </div>
  )
}
