import { useEffect, useRef, useState } from 'react'

interface PollResult<T> {
  data: T | null
  error: Error | null
  loading: boolean
}

/**
 * usePoll 挂载即拉取一次,之后按 intervalMs 轮询;document.hidden 时暂停,
 * 重新可见时立即补一次;卸载时清理定时器与监听。fn 引用变化会重启轮询。
 */
export function usePoll<T>(fn: () => Promise<T>, intervalMs: number): PollResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const result = await fnRef.current()
        if (cancelled) return
        setData(result)
        setError(null)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e : new Error(String(e)))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    function schedule() {
      clearTimeout(timer)
      if (document.hidden) return
      timer = setTimeout(async () => {
        await tick()
        schedule()
      }, intervalMs)
    }

    function onVisibility() {
      if (!document.hidden) {
        tick().then(schedule)
      } else {
        clearTimeout(timer)
      }
    }

    tick().then(schedule)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])

  return { data, error, loading }
}
