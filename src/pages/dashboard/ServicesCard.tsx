import { useCallback, useEffect, useState } from 'react'
import { apiFetch, tokenStore } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Card } from '../../components/Card'
import { Badge } from '../../components/Badge'
import { Spinner } from '../../components/Spinner'

// 关注的常驻服务(命中即展示),取前若干条。
const WATCH = ['nginx', 'mysql', 'mysqld', 'mariadb', 'redis', 'redis-server', 'docker', 'php-fpm']

interface Service {
  name: string
  active: string
  version: string
}

type Verb = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable'

const verbLabel: Record<Verb, string> = {
  start: '启动',
  stop: '停止',
  restart: '重启',
  reload: '重载',
  enable: '自启',
  disable: '禁用',
}

// 危险确认头,后端 admin 校验为权威;UI 仅作角色门。
const DANGER = { 'X-Confirm-Danger': '1' }

// 服务 verb 端点返回 text/plain(命令输出),不能走强制 JSON 的 apiFetch,用裸 fetch 自带 Bearer。
async function callVerb(verb: Verb, unit: string): Promise<void> {
  const t = tokenStore.get()
  const res = await fetch(`/api/m/service/${verb}?unit=${encodeURIComponent(unit)}`, {
    method: 'POST',
    headers: t ? { ...DANGER, Authorization: `Bearer ${t.access}` } : DANGER,
  })
  const body = await res.text()
  if (!res.ok) throw new Error(body.trim() || `操作失败 (${res.status})`)
}

/** ServicesCard 服务卡:关键服务运行状态 + 版本 + 操作(仅 admin 可操作,对标设计稿 Services)。 */
export function ServicesCard() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [services, setServices] = useState<Service[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  // 列表加载失败(容器无 systemd 时后端返回非 200 / "services unavailable")的友好空态。
  const [loadErr, setLoadErr] = useState(false)

  const load = useCallback(() => {
    apiFetch<Service[]>('/api/m/service/services')
      .then((all) => {
        setLoadErr(false)
        setServices(
          (Array.isArray(all) ? all : [])
            .filter((s) => WATCH.some((w) => s.name === w || s.name.startsWith(w + '@')))
            .slice(0, 6),
        )
      })
      .catch(() => {
        setServices([])
        setLoadErr(true)
      })
  }, [])

  useEffect(load, [load])

  async function act(verb: Verb, name: string) {
    if (busy || !isAdmin) return
    setBusy(name)
    setErr('')
    try {
      await callVerb(verb, name)
      load()
    } catch (e) {
      setErr(`${name} ${verbLabel[verb]}失败:${e instanceof Error ? e.message : '未知错误'}`)
    } finally {
      setBusy('')
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-text">服务状态</h3>
      {err && <p className="text-xs text-crit">{err}</p>}
      {loadErr ? (
        <p className="text-xs text-muted">暂无法获取服务状态(当前环境可能不支持 systemd)。</p>
      ) : services.length === 0 ? (
        <p className="text-xs text-muted">未检测到关键服务。</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {services.map((s) => (
            <ServiceRow
              key={s.name}
              s={s}
              isAdmin={isAdmin}
              busy={busy === s.name}
              onAct={act}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

function ServiceRow({
  s,
  isAdmin,
  busy,
  onAct,
}: {
  s: Service
  isAdmin: boolean
  busy: boolean
  onAct: (verb: Verb, name: string) => void
}) {
  const on = s.active === 'running'
  return (
    <div className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      <Badge status={on ? 'online' : 'crit'}>{on ? '运行中' : s.active || '已停止'}</Badge>
      <span className="flex-1 truncate font-[family-name:var(--font-mono)] text-[13px] text-text">
        {s.name}
      </span>
      {s.version && (
        <span className="shrink-0 font-[family-name:var(--font-mono)] text-xs text-faint">
          {s.version}
        </span>
      )}
      {isAdmin && (
        <span className="flex shrink-0 items-center gap-2 text-xs">
          {busy ? (
            <Spinner size={14} />
          ) : on ? (
            <>
              <Op label="重启" onClick={() => onAct('restart', s.name)} />
              <Op label="重载" onClick={() => onAct('reload', s.name)} />
              <Op label="停止" danger onClick={() => onAct('stop', s.name)} />
            </>
          ) : (
            <Op label="启动" onClick={() => onAct('start', s.name)} />
          )}
        </span>
      )}
    </div>
  )
}

function Op({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/60 ${
        danger ? 'text-crit' : 'text-brand'
      }`}
    >
      {label}
    </button>
  )
}
