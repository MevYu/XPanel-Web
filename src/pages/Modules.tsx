import { useState } from 'react'
import { apiFetch } from '../api/client'
import { useModules } from '../hooks/useModules'
import { Card } from '../components/Card'
import { Switch } from '../components/Switch'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { PageHeader } from '../components/PageHeader'
import type { ModuleView } from '../api/types'

interface Group {
  category: string
  items: ModuleView[]
}

// 全部模块按 category 分组,保留出现顺序。
function groupByCategory(mods: ModuleView[]): Group[] {
  const out: Group[] = []
  const index = new Map<string, Group>()
  for (const m of mods) {
    let g = index.get(m.category)
    if (!g) {
      g = { category: m.category, items: [] }
      index.set(m.category, g)
      out.push(g)
    }
    g.items.push(m)
  }
  return out
}

// 提取后端校验文案;HttpError.message 为响应体文本(后端已脱敏),取不到时给通用文案。
function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : ''
  return msg || '操作失败,请稍后重试'
}

/** Modules 模块管理:按 category 分组列出全部模块,逐行开关启用/停用。 */
export default function Modules() {
  const { all, loading, error, reload } = useModules()

  if (loading && all.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  if (error && all.length === 0) {
    return (
      <Card className="text-sm text-muted">
        无法获取模块列表,请确认后端服务在运行,稍后重试。
      </Card>
    )
  }

  const groups = groupByCategory(all)
  const enabledCount = all.filter((m) => m.enabled).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="模块管理"
        subtitle={`共 ${all.length} 个模块,${enabledCount} 个已启用`}
      />
      {groups.map((g) => (
        <section key={g.category} className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wider text-muted">{g.category}</h2>
          <Card className="divide-y divide-border p-0">
            {g.items.map((m) => (
              <ModuleRow key={m.id} module={m} onChanged={reload} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  )
}

function ModuleRow({ module, onChanged }: { module: ModuleView; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function toggle(next: boolean) {
    if (busy || module.always_on) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/api/modules/${module.id}/${next ? 'enable' : 'disable'}`, {
        method: 'POST',
      })
      onChanged()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-text">{module.name}</span>
          {module.always_on && <Badge status="neutral">常驻</Badge>}
          {module.health &&
            (module.health.ok ? (
              <Badge status="online">就绪</Badge>
            ) : (
              <Badge status="warn">依赖未就绪</Badge>
            ))}
        </div>
        {module.health && !module.health.ok && module.health.reason && (
          <span className="text-xs text-warn">{module.health.reason}</span>
        )}
        {(module.requires ?? []).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">依赖</span>
            {(module.requires ?? []).map((r) => (
              <span
                key={r}
                className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-[family-name:var(--font-mono)] text-xs text-muted"
              >
                {r}
              </span>
            ))}
          </div>
        )}
        {err && <span className="text-xs text-crit">{err}</span>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {busy && <Spinner size={14} />}
        <Switch
          checked={module.enabled}
          onChange={toggle}
          disabled={module.always_on || busy}
          aria-label={`${module.enabled ? '停用' : '启用'} ${module.name}`}
        />
      </div>
    </div>
  )
}
