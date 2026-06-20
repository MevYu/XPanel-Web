import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Card } from '../../components/Card'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { Globe, Boxes, Code2, X } from 'lucide-react'
import { type Kind, type Site, PHP_VERSIONS, errorText, fieldClass, splitList } from './shared'

interface Form {
  domains: string
  kind: Kind
  listen: string
  root: string
  upstream: string
  index: string
  phpVersion: string
}

const empty: Form = {
  domains: '',
  kind: 'static',
  listen: '80',
  root: '',
  upstream: '',
  index: '',
  phpVersion: PHP_VERSIONS[0],
}

const KIND_CARDS: { key: Kind; label: string; hint: string; Icon: typeof Globe }[] = [
  { key: 'static', label: '静态', hint: 'HTML / 前端构建产物', Icon: Globe },
  { key: 'php', label: 'PHP', hint: 'PHP-FPM 应用', Icon: Code2 },
  { key: 'proxy', label: '反向代理', hint: '转发到后端服务', Icon: Boxes },
]

/** CreateSiteModal 新建站点弹窗:类型卡选择 + 域名多填 + 根目录 + 按类型展开(PHP 版本 / 反代目标)。 */
export function CreateSiteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (site: Site) => void
}) {
  const [form, setForm] = useState<Form>(empty)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const domains = splitList(form.domains).map((d) => d.toLowerCase())
  const listenNum = Number(form.listen)
  const listenValid = Number.isInteger(listenNum) && listenNum >= 1 && listenNum <= 65535
  const proxyValid = form.kind !== 'proxy' || form.upstream.trim().length > 0
  const canSubmit = domains.length > 0 && listenValid && proxyValid && !busy

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = { domains, kind: form.kind, listen: listenNum }
      if (form.root.trim()) body.root = form.root.trim()
      if (form.kind === 'proxy') {
        body.upstream = form.upstream.trim()
      } else {
        if (form.index.trim()) body.index = form.index.trim()
        if (form.kind === 'php' && form.phpVersion) body.php_version = form.phpVersion
      }
      const site = await apiFetch<Site>('/api/m/sites/sites', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      onCreated(site)
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
        className="flex max-h-[90vh] w-full max-w-xl flex-col gap-4 overflow-auto border-border/80 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-text">
              新建站点
            </h3>
            <p className="text-xs text-muted">配置生成后经 nginx -t 校验,失败则不创建。</p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-(--radius-card) text-muted transition hover:bg-surface-2 hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {KIND_CARDS.map(({ key, label, hint, Icon }) => {
            const active = form.kind === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => set('kind', key)}
                className={`group flex flex-col items-start gap-2 rounded-(--radius-card) border p-3 text-left transition ${
                  active ? 'border-brand bg-brand-soft' : 'border-border bg-surface-2 hover:border-muted/60'
                }`}
              >
                <Icon size={18} className={active ? 'text-brand' : 'text-muted group-hover:text-text'} />
                <span className="text-sm font-medium text-text">{label}</span>
                <span className="text-[11px] leading-tight text-muted">{hint}</span>
              </button>
            )
          })}
        </div>

        <Input
          label="域名"
          placeholder="多个用空格或逗号分隔,如 example.com www.example.com"
          value={form.domains}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          onChange={(e) => set('domains', e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="监听端口"
            placeholder="80"
            inputMode="numeric"
            value={form.listen}
            error={form.listen.length > 0 && !listenValid ? '端口需为 1–65535' : undefined}
            onChange={(e) => set('listen', e.target.value)}
          />
          {form.kind === 'proxy' ? (
            <Input
              label="后端地址"
              placeholder="http://127.0.0.1:3000"
              value={form.upstream}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => set('upstream', e.target.value)}
            />
          ) : (
            <Input
              label="首页文件"
              placeholder={form.kind === 'php' ? '可选,如 index.php' : '可选,如 index.html'}
              value={form.index}
              spellCheck={false}
              onChange={(e) => set('index', e.target.value)}
            />
          )}
        </div>

        {form.kind !== 'proxy' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="根目录"
              placeholder="留空使用 web_root/<站点名>"
              value={form.root}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-[family-name:var(--font-mono)]"
              onChange={(e) => set('root', e.target.value)}
            />
            {form.kind === 'php' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-muted">PHP 版本</span>
                <select
                  value={form.phpVersion}
                  onChange={(e) => set('phpVersion', e.target.value)}
                  className={fieldClass}
                >
                  {PHP_VERSIONS.map((v) => (
                    <option key={v} value={v}>
                      PHP {v}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

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
            创建站点
          </Button>
        </div>
      </Card>
    </div>
  )
}
