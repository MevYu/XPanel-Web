import { useCallback, useEffect, useState } from 'react'
import { apiFetch, tokenStore } from '../api/client'
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

// php-fpm/systemctl 端点返回 text/plain:apiFetch 会强制 JSON.parse 抛错,改用裸 fetch。
async function fetchTextPost(path: string): Promise<string> {
  const t = tokenStore.get()
  const res = await fetch(path, {
    method: 'POST',
    headers: t ? { Authorization: `Bearer ${t.access}`, ...DANGER } : DANGER,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

interface VersionInfo {
  version: string
  banner: string
  fpm_unit: string
  fpm_active: boolean
  cli_default: boolean
}

interface PhpSettings {
  install_base: string
  fpm_conf_dir: string
  fpm_sock_dir: string
  fpm_unit_template: string
}

const emptySettings: PhpSettings = {
  install_base: '',
  fpm_conf_dir: '',
  fpm_sock_dir: '',
  fpm_unit_template: '',
}

// 后端 ini 白名单键,按此固定顺序渲染表单。
const INI_KEYS = [
  'memory_limit',
  'max_execution_time',
  'max_input_time',
  'post_max_size',
  'upload_max_filesize',
  'max_file_uploads',
  'default_socket_timeout',
  'display_errors',
  'error_reporting',
  'date.timezone',
  'short_open_tag',
  'max_input_vars',
  'realpath_cache_size',
  'opcache.memory_consumption',
] as const

/** Php:列出已装版本,编辑 php.ini(白名单键),启停扩展,php-fpm 启停,模块设置。 */
export default function Php() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [ini, setIni] = useState<Record<string, string>>({})
  const [extensions, setExtensions] = useState<string[]>([])
  const [detailBusy, setDetailBusy] = useState(false)
  const [output, setOutput] = useState('')

  const [settings, setSettings] = useState<PhpSettings>(emptySettings)
  const [showSettings, setShowSettings] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const data = await apiFetch<VersionInfo[]>('/api/m/php/versions')
      setVersions(data)
    } catch (e) {
      setLoadErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const loadDetail = useCallback(async (version: string) => {
    setDetailBusy(true)
    setFeedback(null)
    try {
      const [iniData, extData] = await Promise.all([
        apiFetch<Record<string, string>>(`/api/m/php/versions/${version}/ini`),
        apiFetch<string[]>(`/api/m/php/versions/${version}/extensions`),
      ])
      setIni(iniData ?? {})
      setExtensions(extData ?? [])
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setDetailBusy(false)
    }
  }, [])

  function select(version: string) {
    if (selected === version) {
      setSelected(null)
      return
    }
    setSelected(version)
    setOutput('')
    void loadDetail(version)
  }

  async function saveIni() {
    if (!selected || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      const payload: Record<string, string> = {}
      for (const k of INI_KEYS) {
        if (ini[k] !== undefined) payload[k] = ini[k]
      }
      const updated = await apiFetch<Record<string, string>>(
        `/api/m/php/versions/${selected}/ini`,
        { method: 'PUT', headers: DANGER, body: JSON.stringify(payload) },
      )
      setIni(updated ?? {})
      setFeedback({ kind: 'ok', text: 'php.ini 已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function toggleExt(ext: string, enable: boolean) {
    if (!selected || !isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch(`/api/m/php/versions/${selected}/extensions/${ext}/${enable ? 'enable' : 'disable'}`, {
        method: 'POST',
        headers: DANGER,
      })
      setFeedback({ kind: 'ok', text: `扩展 ${ext} 已${enable ? '启用' : '禁用'}` })
      await loadDetail(selected)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function fpm(verb: 'start' | 'stop' | 'restart') {
    if (!selected || !isAdmin) return
    if (verb === 'stop' && !window.confirm(`确认停止 php-fpm ${selected}?依赖它的站点会中断。`)) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await fetchTextPost(`/api/m/php/versions/${selected}/fpm/${verb}`)
      setOutput(res)
      setFeedback({ kind: 'ok', text: `php-fpm ${verb} 已执行` })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function openSettings() {
    if (showSettings) {
      setShowSettings(false)
      return
    }
    setShowSettings(true)
    try {
      const s = await apiFetch<PhpSettings>('/api/m/php/settings')
      setSettings(s)
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    }
  }

  async function saveSettings() {
    if (!isAdmin) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/php/settings', { method: 'PUT', headers: DANGER, body: JSON.stringify(settings) })
      setFeedback({ kind: 'ok', text: '设置已保存' })
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-text">PHP 版本</span>
          <Button size="sm" variant="ghost" onClick={() => void openSettings()}>
            {showSettings ? '收起设置' : '设置'}
          </Button>
        </div>

        {showSettings && (
          <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="安装根目录"
                value={settings.install_base}
                spellCheck={false}
                disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, install_base: e.target.value }))}
              />
              <Input
                label="FPM 配置目录"
                value={settings.fpm_conf_dir}
                spellCheck={false}
                disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, fpm_conf_dir: e.target.value }))}
              />
              <Input
                label="FPM socket 目录"
                value={settings.fpm_sock_dir}
                spellCheck={false}
                disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, fpm_sock_dir: e.target.value }))}
              />
              <Input
                label="FPM systemd 单元模板"
                placeholder="须含 %s,如 php-fpm-%s"
                value={settings.fpm_unit_template}
                spellCheck={false}
                disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, fpm_unit_template: e.target.value }))}
              />
            </div>
            <div>
              <Button size="sm" onClick={() => void saveSettings()} disabled={!isAdmin || busy}>
                保存设置
              </Button>
            </div>
            {!isAdmin && <p className="text-xs text-muted">设置需要 admin 角色。</p>}
          </div>
        )}

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : loadErr && versions.length === 0 ? (
          <p className="p-5 text-sm text-muted">{loadErr}</p>
        ) : versions.length === 0 ? (
          <p className="p-5 text-sm text-muted">未检测到 PHP 版本。</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {versions.map((v) => (
              <div key={v.version} className="flex flex-col gap-3 px-5 py-3.5">
                <div className="flex items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text">PHP {v.version}</span>
                      <Badge status={v.banner ? 'online' : 'neutral'}>
                        {v.banner ? '可用' : '未知'}
                      </Badge>
                      <Badge status={v.fpm_active ? 'online' : 'neutral'}>
                        FPM {v.fpm_active ? '运行中' : '已停止'}
                      </Badge>
                      {v.cli_default && <Badge status="online">CLI 默认</Badge>}
                    </div>
                    {v.banner && (
                      <span className="truncate font-[family-name:var(--font-mono)] text-xs text-muted">
                        {v.banner}
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => select(v.version)}>
                    {selected === v.version ? '收起' : '管理'}
                  </Button>
                </div>

                {selected === v.version && (
                  <div className="flex flex-col gap-4 rounded-(--radius-card) border border-border bg-surface-2 p-4">
                    {detailBusy ? (
                      <div className="flex h-24 items-center justify-center">
                        <Spinner size={20} />
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-text">php-fpm</span>
                          <Button size="sm" variant="ghost" onClick={() => void fpm('start')} disabled={!isAdmin || busy}>
                            启动
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void fpm('restart')} disabled={!isAdmin || busy}>
                            重启
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => void fpm('stop')} disabled={!isAdmin || busy}>
                            停止
                          </Button>
                        </div>

                        <div className="flex flex-col gap-3">
                          <span className="text-sm font-medium text-text">php.ini</span>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {INI_KEYS.filter((k) => ini[k] !== undefined).map((k) => (
                              <Input
                                key={k}
                                label={k}
                                value={ini[k] ?? ''}
                                spellCheck={false}
                                disabled={!isAdmin}
                                onChange={(e) => setIni((m) => ({ ...m, [k]: e.target.value }))}
                              />
                            ))}
                          </div>
                          <div>
                            <Button size="sm" onClick={() => void saveIni()} disabled={!isAdmin || busy}>
                              保存 php.ini
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <span className="text-sm font-medium text-text">
                            已加载扩展({extensions.length})
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {extensions.map((ext) => (
                              <span
                                key={ext}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-text"
                              >
                                {ext}
                                <button
                                  className="text-muted hover:text-crit disabled:opacity-40"
                                  onClick={() => void toggleExt(ext, false)}
                                  disabled={!isAdmin || busy}
                                  title="禁用扩展"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                          <ExtEnable
                            disabled={!isAdmin || busy}
                            onEnable={(name) => void toggleExt(name, true)}
                          />
                        </div>

                        {output && (
                          <pre className="max-h-48 overflow-auto rounded-(--radius-card) bg-bg p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
                            {output}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {!isAdmin && <p className="text-xs text-muted">php.ini、扩展与 fpm 操作需要 admin 角色。</p>}
      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}

interface ExtEnableProps {
  disabled: boolean
  onEnable: (name: string) => void
}

function ExtEnable({ disabled, onEnable }: ExtEnableProps) {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  return (
    <div className="flex items-end gap-2">
      <Input
        label="启用扩展"
        placeholder="扩展名,如 redis"
        value={name}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="flex-1"
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        size="md"
        variant="ghost"
        disabled={disabled || trimmed.length === 0}
        onClick={() => {
          onEnable(trimmed)
          setName('')
        }}
      >
        启用
      </Button>
    </div>
  )
}
