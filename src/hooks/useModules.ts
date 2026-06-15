import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import type { ModuleView } from '../api/types'

interface ModulesResult {
  all: ModuleView[]
  enabled: ModuleView[]
  loading: boolean
  error: Error | null
  reload(): void
}

/** useModules 拉取 /api/modules,暴露全部模块与已启用子集,reload 重新拉取。 */
export function useModules(): ModulesResult {
  const [all, setAll] = useState<ModuleView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    apiFetch<ModuleView[]>('/api/modules')
      .then((mods) => {
        setAll(mods)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false))
  }, [])

  useEffect(reload, [reload])

  const enabled = useMemo(() => all.filter((m) => m.enabled), [all])

  return { all, enabled, loading, error, reload }
}
